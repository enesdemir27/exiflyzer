import { useState, useEffect } from 'react'
import { FiUploadCloud, FiInfo, FiImage, FiCamera, FiMapPin, FiClock, FiAlertTriangle, FiFile, FiFolder, FiFileText, FiCalendar, FiLayers, FiShield, FiMail, FiGithub, FiTwitter, FiX } from 'react-icons/fi'
import './App.css'

function App() {
  const [metadata, setMetadata] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [supportedTypes, setSupportedTypes] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [systemStatus, setSystemStatus] = useState(null)
  const [activeModal, setActiveModal] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)

  useEffect(() => {
    // Check system status when component mounts
    fetch('http://localhost:5000/system-check')
      .then(res => res.json())
      .then(data => {
        setSystemStatus(data)
        if (data.status === 'ok') {
          setSupportedTypes(data.supported_extensions)
          console.log("Supported file types:", data.supported_extensions)
        }
      })
      .catch(err => {
        console.error("Error checking system status:", err)
        setError('Failed to connect to server')
      })
  }, [])

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    console.log("File dropped");
    const file = e.dataTransfer.files[0];
    console.log("Dropped file:", file);
    
    if (!file) {
      console.log("No file in drop");
      return;
    }

    // Get file extension
    const fileExt = file.name.split('.').pop().toLowerCase();
    console.log("File extension:", fileExt);
    
    if (!supportedTypes?.includes(fileExt)) {
      setError(`File type .${fileExt} is not supported. Supported types: ${supportedTypes?.join(', ')}`);
      console.log("Unsupported dropped file type");
      return;
    }

    await processFile(file);
  };

  const handleFileUpload = async (e) => {
    setError('');
    setMetadata(null);

    const file = e.target.files[0];
    console.log("Selected file:", file);
    
    if (!file) {
      console.log("No file selected");
      return;
    }

    // Get file extension
    const fileExt = file.name.split('.').pop().toLowerCase();
    console.log("File extension:", fileExt);
    
    if (!supportedTypes?.includes(fileExt)) {
      setError(`File type .${fileExt} is not supported. Supported types: ${supportedTypes?.join(', ')}`);
      console.log("Unsupported file type");
      return;
    }

    await processFile(file);
  };

  const processFile = async (file) => {
    console.log("Processing file:", file);
    if (systemStatus?.status === 'error') {
      console.log("System error:", systemStatus.message);
      setError(systemStatus.message);
      return;
    }

    setLoading(true);
    setError('');
    setMetadata(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      console.log("Sending request to server...");
      const response = await fetch('http://localhost:5000/upload', {
        method: 'POST',
        body: formData,
      });

      console.log("Response status:", response.status);
      console.log("Response headers:", [...response.headers.entries()]);
      
      const data = await response.json();
      console.log("Response data:", data);
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to process file');
      }

      console.log("Setting metadata:", data.metadata);
      setMetadata(data.metadata);
      setSelectedFile(file);
    } catch (err) {
      console.error("Error processing file:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMetadata = async () => {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      setLoading(true);
      const response = await fetch('http://localhost:5000/remove-metadata', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to remove metadata');
      }

      // Dosyayı indir
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `clean_${selectedFile.name}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'basic':
        return <FiFile />;
      case 'file':
        return <FiFolder />;
      case 'pdf':
        return <FiFileText />;
      case 'image':
        return <FiImage />;
      case 'camera':
        return <FiCamera />;
      case 'location':
        return <FiMapPin />;
      case 'datetime':
        return <FiCalendar />;
      default:
        return <FiInfo />;
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes || isNaN(bytes)) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const renderMetadataValue = (value, key) => {
    if (typeof value === 'object' && value !== null) {
      return <pre>{JSON.stringify(value, null, 2)}</pre>;
    }

    // Eğer "size" veya "File Size" içeren bir anahtar ise ve değer bir sayı ise
    const isFileSize = (key) => key.toLowerCase().includes('size');
    if (isFileSize(key) && !isNaN(value)) {
      return formatFileSize(parseInt(value));
    }

    return value;
  };

  const MetadataItem = ({ label, value }) => {
    const isLongValue = typeof value === 'string' && value.length > 100;
    const [isExpanded, setIsExpanded] = useState(false);

    const displayValue = renderMetadataValue(value, label);

    return (
      <div className="metadata-item">
        <div className="metadata-label">{label}</div>
        <div 
          className={`metadata-value ${isLongValue ? 'long' : ''}`}
          style={{ maxHeight: isExpanded ? 'none' : '200px' }}
          onClick={() => isLongValue && setIsExpanded(!isExpanded)}
          title={isLongValue ? (isExpanded ? 'Click to collapse' : 'Click to expand') : ''}
        >
          {displayValue}
        </div>
      </div>
    );
  };

  const MetadataSection = ({ title, icon, data }) => {
    if (!data || Object.keys(data).length === 0) return null;

    return (
      <div className="metadata-section">
        <h3>
          {icon}
          {title}
        </h3>
        <div className="metadata-content">
          {Object.entries(data).map(([key, value]) => (
            <MetadataItem 
              key={key} 
              label={key.replace(/([A-Z])/g, ' $1').trim()} 
              value={value} 
            />
          ))}
        </div>
      </div>
    );
  };

  const Modal = ({ isOpen, onClose, title, children }) => {
    if (!isOpen) return null;

    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>{title}</h2>
            <button className="modal-close" onClick={onClose}>
              <FiX />
            </button>
          </div>
          <div className="modal-body">
            {children}
          </div>
        </div>
      </div>
    );
  };

  const PrivacyPolicy = () => (
    <div className="policy-content">
      <h3>Your Privacy is Our Priority</h3>
      <p>At Exiflyzer, we take your privacy seriously. Here's how we protect your data:</p>
      <ul>
        <li>All file processing is done locally on your device</li>
        <li>We never store or transmit your files or metadata</li>
        <li>No cookies or tracking mechanisms are used</li>
        <li>No personal information is collected</li>
      </ul>
      
      <h3>Data Processing</h3>
      <p>When you upload a file:</p>
      <ul>
        <li>The file remains on your device</li>
        <li>Metadata is extracted locally using ExifTool</li>
        <li>No data is sent to any external servers</li>
        <li>All data is cleared when you close the browser</li>
      </ul>
    </div>
  );

  const TermsOfService = () => (
    <div className="terms-content">
      <h3>Usage Terms</h3>
      <p>By using Exiflyzer, you agree to:</p>
      <ul>
        <li>Use the service for lawful purposes only</li>
        <li>Not attempt to circumvent any security measures</li>
        <li>Not use the service to process malicious files</li>
        <li>Accept that the service is provided "as is"</li>
      </ul>

      <h3>Limitations</h3>
      <ul>
        <li>Maximum file size: 100MB</li>
        <li>Supported file types: Images and PDFs</li>
        <li>Processing is limited to metadata extraction</li>
      </ul>

      <h3>Disclaimer</h3>
      <p>
        Exiflyzer is provided without any warranty. We are not responsible for any damages 
        that may arise from the use of this service.
      </p>
    </div>
  );

  const Contact = () => (
    <div className="contact-content">
      <p>Have questions or feedback? We'd love to hear from you!</p>
      
      <div className="contact-methods">
        <div className="contact-method">
          <FiMail />
          <h3>Email</h3>
          <p>support@exiflyzer.com</p>
        </div>
        
        <div className="contact-method">
          <FiGithub />
          <h3>GitHub</h3>
          <p>Follow us on GitHub for updates</p>
          <a href="https://github.com/exiflyzer" target="_blank" rel="noopener noreferrer">
            @exiflyzer
          </a>
        </div>
        
        <div className="contact-method">
          <FiTwitter />
          <h3>Twitter</h3>
          <p>Follow us for news and tips</p>
          <a href="https://twitter.com/exiflyzer" target="_blank" rel="noopener noreferrer">
            @exiflyzer
          </a>
        </div>
      </div>
    </div>
  );

  return (
    <div className="app-container">
      <header>
        <div className="header-content">
          <div className="logo">
            <h1>Exiflyzer</h1>
            <p>Extract and analyze metadata from your files</p>
          </div>
          <nav className="nav-links">
            <a href="#features">Features</a>
            <a href="#about">About</a>
            <a href="#faq">FAQ</a>
          </nav>
        </div>
      </header>

      <main>
        <div className="content-container">
          <div className="main-content">
            <div className="upload-container">
              <div 
                className={`upload-section ${dragActive ? 'drag-active' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <div className="upload-content">
                  <FiUploadCloud className="upload-icon" />
                  <h2>Upload your file</h2>
                  {supportedTypes && (
                    <p className="supported-types">
                      Supported formats: {supportedTypes.join(', ')}
                    </p>
                  )}
                  <div className="file-input-container">
                    <input
                      type="file"
                      onChange={handleFileUpload}
                      accept={supportedTypes?.map(ext => `.${ext}`).join(',')}
                      id="file-upload"
                      disabled={systemStatus?.status === 'error'}
                    />
                    <label 
                      htmlFor="file-upload" 
                      className={`upload-button ${systemStatus?.status === 'error' ? 'disabled' : ''}`}
                    >
                      Choose File
                    </label>
                    {loading && (
                      <div className="loading-overlay">
                        <div className="spinner"></div>
                        <p>Processing file...</p>
                      </div>
                    )}
                  </div>
                  <p className="drag-text">or drag and drop here</p>
                </div>
              </div>

              {error && (
                <div className="error-message">
                  <FiAlertTriangle /> {error}
                </div>
              )}

              {systemStatus?.status === 'error' && (
                <div className="system-error">
                  <h3>System Configuration Required</h3>
                  <p>{systemStatus.message}</p>
                  <div className="installation-steps">
                    <h4>Installation Steps:</h4>
                    <ol>
                      <li>Download ExifTool from the official website</li>
                      <li>Extract the contents to C:\exiftool\</li>
                      <li>Rename exiftool(-k).exe to exiftool.exe</li>
                      <li>Refresh this page</li>
                    </ol>
                  </div>
                </div>
              )}
            </div>

            {metadata && (
              <div className="metadata-container">
                <div className="metadata-size-info">
                  <p>
                    Metadata takes {formatFileSize(JSON.stringify(metadata).length)} ({((JSON.stringify(metadata).length / selectedFile.size) * 100).toFixed(1)}%) of this image and may include sensitive info.
                  </p>
                  <button 
                    className="remove-metadata-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveMetadata();
                    }}
                    disabled={loading}
                  >
                    {loading ? 'Processing...' : 'Remove metadata and download'}
                  </button>
                </div>

                <div className="metadata-grid">
                  {Object.entries(metadata).map(([category, items]) => (
                    <div key={category} className="metadata-category">
                      <div className="category-header">
                        {getCategoryIcon(category)}
                        <h3>{category.split('_').map(word => 
                          word.charAt(0).toUpperCase() + word.slice(1)
                        ).join(' ')}</h3>
                      </div>
                      {Object.entries(items).map(([key, value]) => (
                        <MetadataItem
                          key={key}
                          label={key.replace(/([A-Z])/g, ' $1').trim()} 
                          value={value} 
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="info-sections">
          <section id="features" className="features-section">
            <h2>Key Features</h2>
            <div className="features-grid">
              <div className="feature-card">
                <FiImage className="feature-icon" />
                <h3>Comprehensive Image Analysis</h3>
                <p>Extract detailed EXIF data from images including camera settings, GPS location, and creation date. Support for JPEG, PNG, TIFF, WEBP, and more.</p>
              </div>
              <div className="feature-card">
                <FiFileText className="feature-icon" />
                <h3>PDF Metadata Extraction</h3>
                <p>Analyze PDF documents to reveal author information, creation date, software used, and document properties. Perfect for document management.</p>
              </div>
              <div className="feature-card">
                <FiLayers className="feature-icon" />
                <h3>Advanced Metadata Categories</h3>
                <p>View metadata organized in clear categories: Basic Info, EXIF Data, GPS Location, Color Profiles, and more. Easy to understand and navigate.</p>
              </div>
              <div className="feature-card">
                <FiShield className="feature-icon" />
                <h3>Privacy First</h3>
                <p>All processing happens locally on your device. Your files never leave your computer, ensuring complete privacy and security of your data.</p>
              </div>
              <div className="feature-card">
                <FiClock className="feature-icon" />
                <h3>Instant Processing</h3>
                <p>Get results in milliseconds with our optimized metadata extraction engine. Perfect for both single files and batch processing needs.</p>
              </div>
              <div className="feature-card">
                <FiFile className="feature-icon" />
                <h3>Multiple Format Support</h3>
                <p>Support for a wide range of file formats including JPEG, PNG, GIF, TIFF, WEBP, HEIC, PDF, and more. Continuously adding new format support.</p>
              </div>
            </div>
          </section>

          <section id="faq" className="faq-section">
            <h2>Frequently Asked Questions</h2>
            <div className="faq-list">
              <div className="faq-item">
                <h3>What file types does Exiflyzer support?</h3>
                <p>Exiflyzer supports a wide range of file formats including:</p>
                <ul>
                  <li>Images: JPEG, PNG, GIF, TIFF, WEBP, HEIC</li>
                  <li>Documents: PDF</li>
                  <li>And more formats are being added regularly</li>
                </ul>
              </div>
              <div className="faq-item">
                <h3>Is my data secure when using Exiflyzer?</h3>
                <p>Absolutely! We take your privacy seriously:</p>
                <ul>
                  <li>All processing is done locally on your device</li>
                  <li>Files never leave your computer</li>
                  <li>No data is stored or transmitted</li>
                  <li>No account or registration required</li>
                </ul>
              </div>
              <div className="faq-item">
                <h3>What metadata can I extract from my files?</h3>
                <p>Exiflyzer extracts comprehensive metadata including:</p>
                <ul>
                  <li>Basic file information (size, type, creation date)</li>
                  <li>EXIF data (camera settings, resolution, etc.)</li>
                  <li>GPS location data (if available)</li>
                  <li>Color profiles and image properties</li>
                  <li>Document properties for PDFs</li>
                </ul>
              </div>
              <div className="faq-item">
                <h3>How can I use the extracted metadata?</h3>
                <p>The extracted metadata can be valuable for:</p>
                <ul>
                  <li>Photography workflow optimization</li>
                  <li>Document management and organization</li>
                  <li>Digital asset management</li>
                  <li>Privacy auditing and data cleanup</li>
                </ul>
              </div>
            </div>
          </section>

          <section id="about" className="about-section">
            <h2>About Exiflyzer</h2>
            <div className="about-content">
              <div className="about-text">
                <h3>Your Trusted Metadata Analysis Tool</h3>
                <p>
                  Exiflyzer is a powerful, user-friendly metadata extraction and analysis tool designed for photographers, 
                  developers, and digital content creators. Our mission is to make metadata analysis accessible, 
                  secure, and efficient.
                </p>
                <p>
                  Built with privacy in mind, Exiflyzer processes all files locally on your device, ensuring your 
                  sensitive data never leaves your computer. Whether you're a professional photographer managing your 
                  portfolio, a developer auditing file metadata, or simply curious about what information your files 
                  contain, Exiflyzer provides the insights you need.
                </p>
                <h3>Why Choose Exiflyzer?</h3>
                <ul>
                  <li>Fast and efficient metadata extraction</li>
                  <li>Support for multiple file formats</li>
                  <li>Privacy-focused design</li>
                  <li>User-friendly interface</li>
                  <li>Detailed metadata categorization</li>
                  <li>Regular updates and improvements</li>
                </ul>
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer>
        <div className="footer-content">
          <div className="footer-left">
            <p>&copy; 2025 Exiflyzer. All rights reserved.</p>
          </div>
          <div className="footer-right">
            <button onClick={() => setActiveModal('privacy')}>Privacy Policy</button>
            <button onClick={() => setActiveModal('terms')}>Terms of Service</button>
          </div>
        </div>
      </footer>

      <Modal
        isOpen={activeModal === 'privacy'}
        onClose={() => setActiveModal(null)}
        title="Privacy Policy"
      >
        <PrivacyPolicy />
      </Modal>

      <Modal
        isOpen={activeModal === 'terms'}
        onClose={() => setActiveModal(null)}
        title="Terms of Service"
      >
        <TermsOfService />
      </Modal>

      <Modal
        isOpen={activeModal === 'contact'}
        onClose={() => setActiveModal(null)}
        title="Contact Us"
      >
        <Contact />
      </Modal>
    </div>
  );
}

export default App;