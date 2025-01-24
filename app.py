from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import subprocess
import os
import json
import shutil
import uuid
import logging
from pathlib import Path
from werkzeug.utils import secure_filename
from PIL import Image
import datetime

app = Flask(__name__)
CORS(app)

# Upload klasörü yapılandırması
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max

# Upload klasörünü oluştur
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Temp klasörünü oluştur
TEMP_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'temp')
os.makedirs(TEMP_FOLDER, exist_ok=True)

# Configure detailed logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Constants
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'tiff', 'bmp', 'webp', 'heic', 'pdf'}
EXIFTOOL_PATH = r'c:\exiftool\exiftool.exe'

def allowed_file(filename):
    """Check if the file extension is allowed."""
    if '.' not in filename:
        return False
    ext = filename.rsplit('.', 1)[1].lower()
    logger.debug(f"Checking file extension: {ext}")
    logger.debug(f"Allowed extensions: {ALLOWED_EXTENSIONS}")
    return ext in ALLOWED_EXTENSIONS

def cleanup_temp_file(filepath):
    """Clean up temporary file after processing."""
    try:
        if isinstance(filepath, str):
            filepath = Path(filepath)
        if filepath.exists():
            filepath.unlink()
            logger.info(f"Successfully cleaned up temp file: {filepath}")
    except Exception as e:
        logger.error(f"Error cleaning up temp file {filepath}: {str(e)}")

def get_metadata(file_path):
    """Get metadata from file using ExifTool."""
    try:
        # ExifTool ile tüm olası tarih alanlarını al
        result = subprocess.run(
            [
                EXIFTOOL_PATH,
                '-json',
                '-n',
                '-DateTimeOriginal',
                '-CreateDate',
                '-FileCreateDate',
                '-ModifyDate',
                '-FileModifyDate',
                '-MediaCreateDate',
                '-MediaModifyDate',
                '-TrackCreateDate',
                '-TrackModifyDate',
                file_path
            ],
            capture_output=True,
            text=True,
            check=True
        )
        
        # JSON çıktısını parse et
        metadata = json.loads(result.stdout)[0]
        
        # Tüm metadata'yı al
        full_result = subprocess.run(
            [EXIFTOOL_PATH, '-json', '-n', file_path],
            capture_output=True,
            text=True,
            check=True
        )
        full_metadata = json.loads(full_result.stdout)[0]
        
        # Olası tarih alanlarını kontrol et (öncelik sırasına göre)
        date_fields = [
            'DateTimeOriginal',  # Fotoğraf çekilme tarihi
            'CreateDate',        # Dosya oluşturma tarihi
            'MediaCreateDate',   # Medya oluşturma tarihi
            'TrackCreateDate',   # Track oluşturma tarihi
            'FileCreateDate'     # Sistem dosya tarihi
        ]
        
        creation_date = None
        for field in date_fields:
            if field in metadata and metadata[field]:
                creation_date = metadata[field]
                break
        
        # Temel dosya bilgilerini hazırla
        basic_info = {
            'FileName': os.path.basename(file_path),
            'FileSize': os.path.getsize(file_path),
            'FileType': full_metadata.get('FileType', 'Unknown'),
            'MIMEType': full_metadata.get('MIMEType', 'Unknown'),
            'FileCreateDate': creation_date or datetime.datetime.now().strftime('%Y:%m:%d %H:%M:%S'),
            'FileModifyDate': full_metadata.get('FileModifyDate') or datetime.datetime.now().strftime('%Y:%m:%d %H:%M:%S')
        }
        
        # Metadata'yı kategorilere ayır
        organized_metadata = organize_metadata(full_metadata)
        organized_metadata['basic'] = basic_info
        
        return organized_metadata
        
    except subprocess.CalledProcessError as e:
        logger.error(f"ExifTool error: {e.stderr}")
        raise
    except json.JSONDecodeError as e:
        logger.error(f"JSON parsing error: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error in get_metadata: {str(e)}")
        raise

def organize_metadata(metadata):
    """Organize metadata into categories."""
    try:
        organized = {
            'basic': {},
            'file': {},
            'image': {},
            'exif': {},
            'gps': {},
            'pdf': {},
            'icc_profile': {},
            'xmp': {},
            'other': {}
        }

        # Basic metadata
        basic_fields = ['FileName', 'FileType', 'MIMEType']
        for field in basic_fields:
            if field in metadata:
                organized['basic'][field] = metadata[field]

        # Iterate through all metadata fields
        for key, value in metadata.items():
            # Skip if value is None or empty
            if value is None or value == '':
                continue

            # Skip already processed basic fields
            if key in basic_fields:
                continue

            # Categorize based on field prefix or content
            if key.startswith(('File', 'System')):
                organized['file'][key] = value
            elif key.startswith(('Image', 'Pixel')):
                organized['image'][key] = value
            elif key.startswith('EXIF'):
                organized['exif'][key] = value
            elif key.startswith('GPS'):
                organized['gps'][key] = value
            elif key.startswith('PDF'):
                organized['pdf'][key] = value
            elif key.startswith('ICC'):
                organized['icc_profile'][key] = value
            elif key.startswith('XMP'):
                organized['xmp'][key] = value
            else:
                organized['other'][key] = value

        # Remove empty categories
        return {k: v for k, v in organized.items() if v}

    except Exception as e:
        logger.error(f"Error organizing metadata: {str(e)}")
        raise

def remove_metadata(file_path):
    try:
        # Resim dosyasını aç
        with Image.open(file_path) as img:
            # Yeni bir resim oluştur (metadata olmadan)
            data = list(img.getdata())
            clean_image = Image.new(img.mode, img.size)
            clean_image.putdata(data)
            
            # Geçici dosya oluştur
            temp_filename = f"clean_{os.path.basename(file_path)}"
            temp_path = os.path.join(TEMP_FOLDER, temp_filename)
            
            # Temiz resmi kaydet
            clean_image.save(temp_path)
            
            return temp_path
    except Exception as e:
        logger.error(f"Error removing metadata: {str(e)}")
        return None

@app.route('/upload', methods=['POST'])
def upload_file():
    try:
        # Check if file is present in request
        if 'file' not in request.files:
            logger.error("No file part in request")
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        logger.debug(f"Received file: {file.filename}")
        
        # Check if file was selected
        if file.filename == '':
            logger.error("No file selected")
            return jsonify({'error': 'No file selected'}), 400

        # Check file extension
        if not allowed_file(file.filename):
            logger.error(f"File type not allowed: {file.filename}")
            return jsonify({
                'error': 'File type not supported',
                'supported_types': list(ALLOWED_EXTENSIONS),
                'received_type': file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else 'unknown'
            }), 400

        # Create safe filename
        original_filename = secure_filename(file.filename)
        unique_filename = f"{uuid.uuid4()}_{original_filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
        
        logger.info(f"Processing file: {original_filename}")
        logger.info(f"Temp path: {filepath}")

        # Save the file
        try:
            file.save(filepath)
            logger.info(f"File saved successfully at: {filepath}")
        except Exception as e:
            logger.error(f"Failed to save file: {str(e)}")
            return jsonify({'error': f'Failed to save file: {str(e)}'}), 500

        # Extract metadata
        try:
            metadata = get_metadata(filepath)
            
            return jsonify({
                'success': True,
                'metadata': metadata
            })

        except Exception as e:
            logger.error(f"Metadata extraction failed: {str(e)}")
            return jsonify({'error': f'Failed to process file: {str(e)}'}), 500

        finally:
            # Always clean up the temp file
            cleanup_temp_file(filepath)

    except Exception as e:
        logger.error(f"Unexpected error in upload_file: {str(e)}", exc_info=True)
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/remove-metadata', methods=['POST'])
def remove_metadata_endpoint():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if file and allowed_file(file.filename):
        try:
            # Dosyayı geçici olarak kaydet
            filename = secure_filename(file.filename)
            filepath = os.path.join(TEMP_FOLDER, filename)
            file.save(filepath)
            
            # Metadata'yı temizle
            clean_filepath = remove_metadata(filepath)
            if clean_filepath is None:
                return jsonify({'error': 'Failed to remove metadata'}), 500
            
            # Temiz dosyayı gönder
            return send_file(
                clean_filepath,
                as_attachment=True,
                download_name=f"clean_{filename}"
            )
            
        except Exception as e:
            logger.error(f"Error in remove_metadata_endpoint: {str(e)}")
            return jsonify({'error': str(e)}), 500
            
    return jsonify({'error': 'Invalid file type'}), 400

@app.route('/system-check', methods=['GET'])
def system_check():
    """Check if ExifTool is installed and working."""
    try:
        if not os.path.exists(EXIFTOOL_PATH):
            logger.error(f"ExifTool not found at {EXIFTOOL_PATH}")
            return jsonify({
                'status': 'error',
                'message': 'ExifTool not found'
            }), 404

        # Try to get ExifTool version
        result = subprocess.run([EXIFTOOL_PATH, '-ver'], 
                              capture_output=True, 
                              text=True, 
                              check=True)
        
        version = result.stdout.strip()
        logger.info(f"ExifTool version: {version}")

        return jsonify({
            'status': 'ok',
            'exiftool_version': version,
            'supported_extensions': list(ALLOWED_EXTENSIONS)
        })

    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to get ExifTool version: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'ExifTool error: {str(e)}'
        }), 500
    except Exception as e:
        logger.error(f"System check failed: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'System error: {str(e)}'
        }), 500

@app.route('/supported-types', methods=['GET'])
def get_supported_types():
    return jsonify({
        'supported_extensions': list(ALLOWED_EXTENSIONS),
        'max_file_size_mb': 50
    })

if __name__ == '__main__':
    logger.info("Starting Flask application...")
    logger.info(f"ExifTool path: {EXIFTOOL_PATH}")
    logger.info(f"Upload folder: {UPLOAD_FOLDER}")
    app.run(debug=True)