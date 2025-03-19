"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import html2canvas from 'html2canvas';

// Add image size limits and compression settings
const MAX_IMAGE_SIZE = 800; // Reduced maximum dimension for faster processing
const COMPRESSION_QUALITY = 0.6; // Slightly lower quality for faster processing

// Import the fallback background removal utility
import { fallbackRemoveBackground } from '../utils/fallbackRemoveBackground';

export default function Home() {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [texts, setTexts] = useState<Array<{
    id: string;
    text: string;
    font: string;
    fontSize: number;
    fontColor: string;
    fontWeight: number;
    glowIntensity: number;
    glowColor: string;
    outlineWeight: number;
    outlineColor: string;
    opacity: number;
    positionX: number;
    positionY: number;
    rotation: number;
    horizontalTilt: number;
    verticalTilt: number;
  }>>([{
    id: '1',
    text: "TextBIMG",
    font: "Arial",
    fontSize: 76,
    fontColor: "#ffffff",
    fontWeight: 400,
    glowIntensity: 0,
    glowColor: "#00aaff",
    outlineWeight: 2.5,
    outlineColor: "#ffffff",
    opacity: 1,
    positionX: 50,
    positionY: 40, // Moved up from 50 to 40 to be above the center
    rotation: 0,
    horizontalTilt: 0,
    verticalTilt: 0
  }]);
  const [activeTextId, setActiveTextId] = useState<string>('1');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{width: number, height: number} | null>(null);
  const [containerSize, setContainerSize] = useState<{width: number, height: number} | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [imageLoading, setImageLoading] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeEditTool, setActiveEditTool] = useState<string>('text');
  
  // Fix for hydration error - only render client-specific content after component mounts
  useEffect(() => {
    setIsClient(true);
  }, []);
  
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Helper function to get active text
  const getActiveText = useCallback(() => {
    return texts.find(t => t.id === activeTextId) || texts[0];
  }, [texts, activeTextId]);

  // Helper function to update active text
  const updateActiveText = useCallback((updates: Partial<typeof texts[0]>) => {
    setTexts(prevTexts => 
      prevTexts.map(t => 
        t.id === activeTextId ? { ...t, ...updates } : t
      )
    );
  }, [activeTextId]);

  // Add a new text layer
  const addNewText = useCallback(() => {
    const newId = Date.now().toString();
    const newText = {
      id: newId,
      text: "TextBIMG",
      font: "Arial",
      fontSize: 76,
      fontColor: "#ffffff",
      fontWeight: 400,
      glowIntensity: 0,
      glowColor: "#00aaff",
      outlineWeight: 2.5,
      outlineColor: "#ffffff",
      opacity: 1,
      positionX: 50,
      positionY: 40, // Moved up from 50 to 40 to be above the center
      rotation: 0,
      horizontalTilt: 0,
      verticalTilt: 0
    };
    setTexts(prev => [...prev, newText]);
    setActiveTextId(newId);
  }, []);

  // Remove the active text layer
  const removeActiveText = useCallback(() => {
    if (texts.length <= 1) {
      return; // Keep at least one text layer
    }
    
    const newTexts = texts.filter(t => t.id !== activeTextId);
    setTexts(newTexts);
    setActiveTextId(newTexts[0].id);
  }, [texts, activeTextId]);

  // Optimize container size updates
  useEffect(() => {
    let isUpdating = false;
    const updateContainerSize = () => {
      if (isUpdating || !containerRef.current) return;
      
      isUpdating = true;
      requestAnimationFrame(() => {
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const size = Math.min(rect.width, 600);
          setContainerSize(prev => {
            if (prev?.width === size) return prev;
            return { width: size, height: size };
          });
        }
        isUpdating = false;
      });
    };

    // Debounced resize handler
    let resizeTimeout: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(updateContainerSize, 100);
    };

    updateContainerSize();
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const calculateImageDimensions = useCallback((originalWidth: number, originalHeight: number, containerWidth: number, containerHeight: number) => {
    // If no container height is provided, use a reasonable default based on width
    const effectiveContainerHeight = containerHeight || containerWidth * (originalHeight / originalWidth);
    
    const scale = Math.min(
      containerWidth / originalWidth,
      effectiveContainerHeight / originalHeight
    );

    const width = Math.round(originalWidth * scale);
    const height = Math.round(originalHeight * scale);
    const left = Math.round((containerWidth - width) / 2);
    const top = Math.round((effectiveContainerHeight - height) / 2);

    return { width, height, left, top };
  }, []);

  // Add a function to get the container style based on image size
  const getContainerStyle = useCallback(() => {
    if (!imageSize) return { maxWidth: '600px', margin: '0 auto', height: '600px' };
    
    // Calculate the height based on the aspect ratio, but cap at 600px
    const maxWidth = 600;
    const aspectRatio = imageSize.width / imageSize.height;
    
    if (aspectRatio >= 1) {
      // Landscape or square image
      const height = Math.min(600, maxWidth / aspectRatio);
      return { 
        maxWidth: `${maxWidth}px`, 
        margin: '0 auto', 
        height: `${height}px`,
        aspectRatio: `${aspectRatio}`
      };
    } else {
      // Portrait image
      const height = Math.min(600, maxWidth / aspectRatio * 1.5);
      return { 
        maxWidth: `${maxWidth}px`, 
        margin: '0 auto', 
        height: `${height}px`,
        aspectRatio: `${aspectRatio}`
      };
    }
  }, [imageSize]);

  // Function to compress and resize image before processing
  const prepareImage = async (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      // Add timeout to reject if processing takes too long
      const timeout = setTimeout(() => {
        reject(new Error('Image preparation timed out. Try a smaller image.'));
      }, 30000); // 30 second timeout
      
      const img = new Image();
      img.onload = () => {
        clearTimeout(timeout);
        
        // Calculate new dimensions while maintaining aspect ratio
        let width = img.width;
        let height = img.height;
        
        // More aggressive resizing for large images
        if (width > MAX_IMAGE_SIZE || height > MAX_IMAGE_SIZE) {
          const scale = Math.min(MAX_IMAGE_SIZE / width, MAX_IMAGE_SIZE / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        // Create canvas for resizing
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Draw and compress image
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }
            resolve(new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            }));
          },
          'image/jpeg',
          COMPRESSION_QUALITY
        );
      };
      img.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Failed to load image'));
      };
      
      // Create a FileReader to read the file directly instead of using URL.createObjectURL
      const reader = new FileReader();
      reader.onload = function(e) {
        if (e.target && e.target.result) {
          img.src = e.target.result as string;
        } else {
          clearTimeout(timeout);
          reject(new Error('Failed to read file'));
        }
      };
      reader.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Failed to read file'));
      };
      reader.readAsDataURL(file);
    });
  };

  // Add a function to handle image loading states
  const handleImageLoad = useCallback(() => {
    setImageLoading(false);
  }, []);
  
  const handleImageLoadStart = useCallback(() => {
    setImageLoading(true);
  }, []);

  // Update the onDrop function to handle loading states
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    try {
      setIsProcessing(true);
      setError(null);
      setProcessingProgress(0);
      setImageLoading(true);

      // Check file size before processing
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        setError('Image is too large. Please use an image smaller than 10MB.');
        setIsProcessing(false);
        return;
      }

      setError('Optimizing image...');

      // Prepare image before processing
      const optimizedFile = await prepareImage(file);
      
      // Instead of creating a blob URL, convert directly to data URL
      const reader = new FileReader();
      const originalUrlPromise = new Promise<string>((resolve, reject) => {
        reader.onload = function(e) {
          if (e.target && e.target.result) {
            resolve(e.target.result as string);
          } else {
            reject(new Error('Failed to read file'));
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(optimizedFile);
      });
      
      const originalUrl = await originalUrlPromise;
      setOriginalImage(originalUrl);

      // Load image dimensions with optimized image
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const loadImage = new Promise<void>((resolve, reject) => {
        const imageTimeout = setTimeout(() => {
          reject(new Error('Image loading timed out'));
        }, 15000); // 15 second timeout
        
        img.onload = () => {
          clearTimeout(imageTimeout);
          setImageSize({
            width: img.naturalWidth,
            height: img.naturalHeight
          });
          resolve();
        };
        img.onerror = (e) => {
          clearTimeout(imageTimeout);
          console.error('#1', new Date().getTime() - performance.now() + 'ms', 'Error loading image', originalUrl, e);
          // Try again with a different approach
          const retryImg = new Image();
          const retryTimeout = setTimeout(() => {
            reject(new Error('Image retry loading timed out'));
          }, 15000); // 15 second timeout
          
          retryImg.onload = () => {
            clearTimeout(retryTimeout);
            setImageSize({
              width: retryImg.naturalWidth,
              height: retryImg.naturalHeight
            });
            resolve();
          };
          retryImg.onerror = (e) => {
            clearTimeout(retryTimeout);
            reject(e);
          };
          
          // Since we're already using a data URL, just use it directly
          retryImg.src = originalUrl;
        };
        img.src = originalUrl;
      });

      // Process background removal with optimized image
      const processImage = async () => {
        try {
          setError('Removing background... This may take a moment.');
          
          let processedBlob;
          
          try {
            // Dynamically import the background removal package to avoid build issues
            const { removeBackground } = await import('@imgly/background-removal');
            
            processedBlob = await removeBackground(optimizedFile, {
              progress: (progress: any) => {
                // Ensure progress is a valid number between 0-100
                const progressPercent = progress ? Math.round(progress * 100) : 0;
                setProcessingProgress(progressPercent);
                
                // Update error message with progress for better feedback
                if (progressPercent > 0 && progressPercent < 100) {
                  setError(`Removing background: ${progressPercent}% complete. Please wait...`);
                }
              },
              model: 'medium', // Use medium model for better balance of speed vs quality
              fetchArgs: { 
                cache: 'force-cache',  // Cache model files
                mode: 'cors',         // Add CORS mode
                credentials: 'omit'   // Don't send cookies for cross-origin requests
              },
              // Direct CDN URL for the model files
              publicPath: 'https://unpkg.com/@imgly/background-removal@1.6.0/dist/',
              debug: true // Enable debug for troubleshooting
            });
          } catch (primaryError) {
            console.error('Primary background removal failed, using fallback method:', primaryError);
            setError('Trying alternative background removal method...');
            
            // Use our fallback method
            processedBlob = await fallbackRemoveBackground(optimizedFile);
          }
          
          // Convert the processed blob to a data URL instead of a blob URL
          const processedReader = new FileReader();
          const processedUrlPromise = new Promise<string>((resolve, reject) => {
            processedReader.onload = function(e) {
              if (e.target && e.target.result) {
                resolve(e.target.result as string);
              } else {
                reject(new Error('Failed to read processed file'));
              }
            };
            processedReader.onerror = reject;
            processedReader.readAsDataURL(processedBlob);
          });
          
          const processedUrl = await processedUrlPromise;
          setProcessedImage(processedUrl);
          setProcessingProgress(100);
          setError(null);
        } catch (err) {
          console.error('Error removing background:', err);
          setError('Failed to remove background. Please try a different image or check your internet connection. ' + 
                  (err instanceof Error ? `Error: ${err.message}` : ''));
          throw err; // Re-throw to handle in the outer catch
        }
      };

      // Run operations in parallel with optimized images
      try {
      await Promise.all([loadImage, processImage()]);
      } catch (parallelErr) {
        console.error('Error in parallel operations:', parallelErr);
        // Error already set in the individual operations
      }
    } catch (err) {
      console.error('Error processing image:', err);
      setError(err instanceof Error ? err.message : 'Failed to process image');
    } finally {
      setIsProcessing(false);
    }
  }, []);

  // Add cleanup for the canvas element
  useEffect(() => {
    return () => {
      const canvases = document.querySelectorAll('canvas');
      canvases.forEach(canvas => canvas.remove());
    };
  }, []);

  // Remove URL cleanup since we're using data URLs now
  useEffect(() => {
    return () => {
      // No need to revoke data URLs
    };
  }, [originalImage, processedImage]);

  // Function to use html2canvas as a fallback
  const fallbackToHtml2Canvas = () => {
    setError('Using alternative method to capture image...');
    // Use html2canvas as a fallback with improved settings
    if (imageContainerRef.current) {
      html2canvas(imageContainerRef.current, {
        allowTaint: true,
        useCORS: true,
        backgroundColor: null, // Transparent background
        scale: 4, // Increased for better text rendering
        logging: true,
        onclone: (clonedDoc) => {
          // Find all text elements in the cloned document and ensure they're visible
          const textElements = clonedDoc.querySelectorAll('[style*="font-family"]');
          console.log('Found text elements for html2canvas:', textElements.length);
          
          textElements.forEach(el => {
            if (el instanceof HTMLElement) {
              // Make sure text is visible in the clone with enhanced styling
              el.style.visibility = 'visible';
              el.style.opacity = '1';
              
              // Enhance text rendering for better visibility
              const currentFontSize = parseFloat(window.getComputedStyle(el).fontSize);
              if (!isNaN(currentFontSize)) {
                // Slightly increase font size for better visibility
                el.style.fontSize = `${currentFontSize * 1.2}px`;
              }
              
              // Enhance text shadow if present
              const currentShadow = window.getComputedStyle(el).textShadow;
              if (currentShadow && currentShadow !== 'none') {
                // Make shadow stronger
                el.style.textShadow = currentShadow.replace(/(\d+)px/g, (match, p1) => {
                  return `${parseInt(p1) * 1.5}px`;
                });
              }
              
              // Enhance outline if present
              const currentStroke = window.getComputedStyle(el).webkitTextStroke;
              if (currentStroke && currentStroke !== 'none' && currentStroke !== '') {
                // Make outline stronger
                el.style.webkitTextStroke = currentStroke.replace(/(\d+)px/g, (match, p1) => {
                  return `${parseFloat(p1) * 1.5}px`;
                });
              }
              
              // Add debug info
              console.log('Enhanced text element:', el.textContent, 'Style:', el.style.cssText);
            }
          });
        }
      }).then(canvas => {
        try {
          const dataUrl = canvas.toDataURL('image/png');
          console.log('html2canvas generated image with size:', canvas.width, 'x', canvas.height);
          downloadImage(dataUrl);
          setError(null);
        } catch (canvasErr) {
          console.error('Failed to generate image with fallback method:', canvasErr);
          setError('Could not download the image. Please try using your browser\'s screenshot feature.');
        }
      }).catch(canvasErr => {
        console.error('Error with fallback capture method:', canvasErr);
        setError('All download methods failed. Please use your browser\'s screenshot feature.');
      });
    }
  };

  // Completely fresh implementation of the download process with enhanced mobile support
  const downloadImage = (dataUrl: string) => {
    // Detect device type
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    
    console.log('Download image called for device type:', { isIOS, isAndroid, dataUrlLength: dataUrl.length });
    
    if (isIOS) {
      // For iOS devices, create a modal with clear instructions
      const modal = document.createElement('div');
      modal.style.position = 'fixed';
      modal.style.top = '0';
      modal.style.left = '0';
      modal.style.width = '100%';
      modal.style.height = '100%';
      modal.style.backgroundColor = 'rgba(0,0,0,0.9)';
      modal.style.zIndex = '10000';
      modal.style.display = 'flex';
      modal.style.flexDirection = 'column';
      modal.style.alignItems = 'center';
      modal.style.justifyContent = 'center';
      modal.style.padding = '20px';
      modal.style.boxSizing = 'border-box';
      modal.style.overflow = 'auto';
      
      // Add close button
      const closeBtn = document.createElement('button');
      closeBtn.innerText = 'Close';
      closeBtn.style.position = 'absolute';
      closeBtn.style.top = '20px';
      closeBtn.style.right = '20px';
      closeBtn.style.padding = '10px 15px';
      closeBtn.style.backgroundColor = '#3B82F6';
      closeBtn.style.color = 'white';
      closeBtn.style.border = 'none';
      closeBtn.style.borderRadius = '5px';
      closeBtn.style.fontSize = '16px';
      closeBtn.style.cursor = 'pointer';
      closeBtn.onclick = () => document.body.removeChild(modal);
      
      // Add instructions
      const instructions = document.createElement('div');
      instructions.style.color = 'white';
      instructions.style.marginBottom = '20px';
      instructions.style.textAlign = 'center';
      instructions.style.maxWidth = '500px';
      instructions.innerHTML = `
        <h2 style="margin-bottom: 15px; font-size: 24px;">Save Your Image</h2>
        <p style="margin-bottom: 15px; font-size: 16px; line-height: 1.5;">
          <strong>To save this image on your iOS device:</strong>
        </p>
        <ol style="text-align: left; margin-bottom: 20px; font-size: 16px; line-height: 1.5;">
          <li>Press and hold on the image below</li>
          <li>Select "Save to Photos" or "Add to Photos"</li>
          <li>The image will be saved to your Photos app</li>
        </ol>
        <p style="font-size: 14px; color: #9CA3AF;">
          If the image doesn't appear, try refreshing the page and trying again.
        </p>
      `;
      
      // Add the image
      const img = document.createElement('img');
      img.src = dataUrl;
      img.style.maxWidth = '100%';
      img.style.maxHeight = '70vh';
      img.style.borderRadius = '8px';
      img.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
      img.style.marginBottom = '20px';
      
      // Add a direct download link as fallback
      const downloadLink = document.createElement('a');
      downloadLink.href = dataUrl;
      downloadLink.download = 'textbimg-result.png';
      downloadLink.style.display = 'block';
      downloadLink.style.padding = '12px 20px';
      downloadLink.style.backgroundColor = '#3B82F6';
      downloadLink.style.color = 'white';
      downloadLink.style.textDecoration = 'none';
      downloadLink.style.borderRadius = '5px';
      downloadLink.style.textAlign = 'center';
      downloadLink.style.margin = '10px auto';
      downloadLink.style.fontWeight = 'bold';
      downloadLink.innerText = 'Download Image';
      
      // Assemble and show the modal
      modal.appendChild(closeBtn);
      modal.appendChild(instructions);
      modal.appendChild(img);
      modal.appendChild(downloadLink);
      document.body.appendChild(modal);
      
      // Set success message
      setError(null);
      setSuccessMessage('Image ready! Follow the instructions to save it.');
    } 
    else if (isAndroid) {
      // For Android devices, use a combination of direct download and helpful modal
      // Create a blob from the data URL
      const byteString = atob(dataUrl.split(',')[1]);
      const mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      
      const blob = new Blob([ab], { type: mimeString });
      const blobUrl = URL.createObjectURL(blob);
      
      // Create a download link
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = 'textbimg-result.png';
      
      // Append to body, click, and remove
      document.body.appendChild(link);
      link.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      }, 100);
      
      // Also show a helpful modal with instructions
      const modal = document.createElement('div');
      modal.style.position = 'fixed';
      modal.style.top = '0';
      modal.style.left = '0';
      modal.style.width = '100%';
      modal.style.height = '100%';
      modal.style.backgroundColor = 'rgba(0,0,0,0.9)';
      modal.style.zIndex = '10000';
      modal.style.display = 'flex';
      modal.style.flexDirection = 'column';
      modal.style.alignItems = 'center';
      modal.style.justifyContent = 'center';
      modal.style.padding = '20px';
      modal.style.boxSizing = 'border-box';
      
      // Add close button
      const closeBtn = document.createElement('button');
      closeBtn.innerText = 'Close';
      closeBtn.style.position = 'absolute';
      closeBtn.style.top = '20px';
      closeBtn.style.right = '20px';
      closeBtn.style.padding = '10px 15px';
      closeBtn.style.backgroundColor = '#3B82F6';
      closeBtn.style.color = 'white';
      closeBtn.style.border = 'none';
      closeBtn.style.borderRadius = '5px';
      closeBtn.style.fontSize = '16px';
      closeBtn.style.cursor = 'pointer';
      closeBtn.onclick = () => document.body.removeChild(modal);
      
      // Add instructions
      const instructions = document.createElement('div');
      instructions.style.color = 'white';
      instructions.style.marginBottom = '20px';
      instructions.style.textAlign = 'center';
      instructions.style.maxWidth = '500px';
      instructions.innerHTML = `
        <h2 style="margin-bottom: 15px; font-size: 24px;">Image Downloaded</h2>
        <p style="margin-bottom: 15px; font-size: 16px; line-height: 1.5;">
          Your image has been downloaded to your device.
        </p>
        <p style="margin-bottom: 15px; font-size: 16px; line-height: 1.5;">
          <strong>If you can't find the image:</strong>
        </p>
        <ol style="text-align: left; margin-bottom: 20px; font-size: 16px; line-height: 1.5;">
          <li>Check your Downloads folder</li>
          <li>Look in your Gallery or Photos app</li>
          <li>Check your browser's download history</li>
        </ol>
        <p style="font-size: 14px; color: #9CA3AF;">
          If you still can't find it, try the download button below.
        </p>
      `;
      
      // Add the image for preview
      const img = document.createElement('img');
      img.src = dataUrl;
      img.style.maxWidth = '100%';
      img.style.maxHeight = '50vh';
      img.style.borderRadius = '8px';
      img.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
      img.style.marginBottom = '20px';
      
      // Add a direct download link as fallback
      const downloadLink = document.createElement('a');
      downloadLink.href = dataUrl;
      downloadLink.download = 'textbimg-result.png';
      downloadLink.style.display = 'block';
      downloadLink.style.padding = '12px 20px';
      downloadLink.style.backgroundColor = '#3B82F6';
      downloadLink.style.color = 'white';
      downloadLink.style.textDecoration = 'none';
      downloadLink.style.borderRadius = '5px';
      downloadLink.style.textAlign = 'center';
      downloadLink.style.margin = '10px auto';
      downloadLink.style.fontWeight = 'bold';
      downloadLink.innerText = 'Download Again';
      
      // Assemble and show the modal
      modal.appendChild(closeBtn);
      modal.appendChild(instructions);
      modal.appendChild(img);
      modal.appendChild(downloadLink);
      document.body.appendChild(modal);
      
      // Set success message
      setError(null);
      setSuccessMessage('Image downloaded successfully!');
    } 
    else {
      // Desktop download method - simple and reliable
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = 'textbimg-result.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Set success message
      setError(null);
      setSuccessMessage('Image downloaded successfully!');
    }
    
    // Auto-hide the success message after 5 seconds
    setTimeout(() => {
      setSuccessMessage(null);
    }, 5000);
  };

  // Function to crop transparent areas from the left and right sides of an image
  const cropTransparentEdges = (dataUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        console.log('Starting to crop transparent edges from image');
        const img = new Image();
        img.onload = () => {
          try {
            // Create a canvas to analyze and crop the image
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            
            if (!ctx) {
              console.error('Failed to get canvas context for cropping');
              resolve(dataUrl); // Return original if we can't crop
              return;
            }
            
            // Draw the image on the canvas
            ctx.drawImage(img, 0, 0);
            
            // Get the image data to analyze transparency
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            
            // Find the left-most and right-most non-transparent pixels
            let leftBound = canvas.width;
            let rightBound = 0;
            
            // Scan each column
            for (let x = 0; x < canvas.width; x++) {
              let hasNonTransparentPixel = false;
              
              // Check each pixel in this column
              for (let y = 0; y < canvas.height; y++) {
                const index = (y * canvas.width + x) * 4;
                // Check if pixel is not transparent (alpha > 0)
                if (data[index + 3] > 0) {
                  hasNonTransparentPixel = true;
                  break;
                }
              }
              
              // If this column has non-transparent pixels
              if (hasNonTransparentPixel) {
                leftBound = Math.min(leftBound, x);
                rightBound = Math.max(rightBound, x);
              }
            }
            
            // Add some padding (10 pixels on each side)
            leftBound = Math.max(0, leftBound - 10);
            rightBound = Math.min(canvas.width - 1, rightBound + 10);
            
            // If we found valid bounds and there's something to crop
            if (leftBound < rightBound && rightBound - leftBound < canvas.width) {
              console.log(`Cropping image from width ${canvas.width} to ${rightBound - leftBound + 1}`);
              
              // Create a new canvas for the cropped image
              const croppedCanvas = document.createElement('canvas');
              croppedCanvas.width = rightBound - leftBound + 1;
              croppedCanvas.height = canvas.height;
              const croppedCtx = croppedCanvas.getContext('2d');
              
              if (!croppedCtx) {
                console.error('Failed to get cropped canvas context');
                resolve(dataUrl); // Return original if we can't crop
                return;
              }
              
              // Draw the cropped portion
              croppedCtx.drawImage(
                canvas, 
                leftBound, 0, rightBound - leftBound + 1, canvas.height,
                0, 0, rightBound - leftBound + 1, canvas.height
              );
              
              // Convert back to data URL
              const croppedDataUrl = croppedCanvas.toDataURL('image/png');
              console.log('Successfully cropped transparent edges');
              resolve(croppedDataUrl);
            } else {
              console.log('No significant transparent edges found to crop');
              resolve(dataUrl); // Return original if no cropping needed
            }
          } catch (err) {
            console.error('Error during image cropping:', err);
            resolve(dataUrl); // Return original on error
          }
        };
        
        img.onerror = (err) => {
          console.error('Failed to load image for cropping:', err);
          resolve(dataUrl); // Return original on error
        };
        
        img.src = dataUrl;
      } catch (err) {
        console.error('Error in cropTransparentEdges:', err);
        resolve(dataUrl); // Return original on error
      }
    });
  };

  // Universal text image renderer for consistent rendering across platforms
  const universalTextImageRender = async (
    backgroundImageUrl: string, 
    subjectImageUrl: string | null, 
    textLayers: typeof texts, 
    isIOS: boolean, 
    isAndroid: boolean,
    mode: 'download' | 'preview' = 'download'
  ): Promise<string | null> => {
    try {
      console.log(`Starting universal renderer in ${mode} mode for ${isIOS ? 'iOS' : isAndroid ? 'Android' : 'desktop'}`);
      console.log(`Background image URL: ${backgroundImageUrl.substring(0, 50)}...`);
      
      // Import scaling factors from TextRenderer
      const { getScalingFactors, getCanvasDimensions } = require('../utils/TextRenderer');
      const factors = getScalingFactors(isIOS, isAndroid, mode);
      const dimensions = getCanvasDimensions(isIOS, isAndroid, mode);
      
      // Create a canvas with appropriate dimensions for the device and mode
      const canvas = document.createElement('canvas');
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      console.log(`Created canvas with dimensions: ${canvas.width}x${canvas.height}`);
      
      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) {
        throw new Error('Failed to create canvas context');
      }
      
      // Enable high quality rendering
      if (ctx.imageSmoothingEnabled !== undefined) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
      }
      
      // CRITICAL FIX: Fill the entire canvas with a solid background color first
      ctx.fillStyle = '#000000'; // Black background
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      console.log('Canvas filled with black background');
      
      // Load and draw the background image with a more reliable approach
      const loadAndDrawBackground = async () => {
        return new Promise<void>((resolve, reject) => {
          const bgImg = new Image();
          
          // Set crossOrigin to anonymous to prevent CORS issues
          bgImg.crossOrigin = 'anonymous';
          
          bgImg.onload = () => {
            try {
              console.log('Background image loaded successfully:', bgImg.width, 'x', bgImg.height);
              
              // Calculate dimensions to maintain aspect ratio
              const bgAspect = bgImg.width / bgImg.height;
              let drawWidth, drawHeight, offsetX, offsetY;
              
              if (bgAspect > 1) {
                // Wider than tall
                drawWidth = canvas.width;
                drawHeight = canvas.width / bgAspect;
                offsetX = 0;
                offsetY = (canvas.height - drawHeight) / 2;
              } else {
                // Taller than wide
                drawHeight = canvas.height;
                drawWidth = canvas.height * bgAspect;
                offsetX = (canvas.width - drawWidth) / 2;
                offsetY = 0;
              }
              
              // Draw background image
              ctx.drawImage(bgImg, offsetX, offsetY, drawWidth, drawHeight);
              console.log('Background image drawn successfully at', offsetX, offsetY, drawWidth, drawHeight);
              resolve();
            } catch (err) {
              console.error('Error drawing background:', err);
              // Don't reject - continue without background
              console.log('Continuing without background image');
              resolve();
            }
          };
          
          bgImg.onerror = (err) => {
            console.error('Failed to load background image:', err);
            // Don't reject - continue without background
            console.log('Continuing without background image');
            resolve();
          };
          
          // Set source to trigger loading
          bgImg.src = backgroundImageUrl;
          
          // Set a timeout to resolve anyway if image loading takes too long
          setTimeout(() => {
            if (!bgImg.complete) {
              console.warn('Background image loading timed out');
              resolve();
            }
          }, 5000);
        });
      };
      
      // Wait for background to be drawn
      await loadAndDrawBackground();
      
      // Draw all text layers with consistent rendering across platforms
      console.log(`Drawing ${textLayers.length} text layers`);
      textLayers.forEach((textItem, index) => {
        // Save the current state
        ctx.save();
        
        // Calculate position with the same offset as in the preview
        const posX = (textItem.positionX / 100) * canvas.width;
        const posY = (textItem.positionY / 100) * canvas.height;
        
        // Apply transformations in the same order as CSS
        ctx.translate(posX, posY);
        ctx.rotate((textItem.rotation * Math.PI) / 180);
        ctx.transform(
          1, Math.tan((textItem.verticalTilt * Math.PI) / 180), 
          Math.tan((textItem.horizontalTilt * Math.PI) / 180), 1, 
          0, 0
        );
        
        // Set font properties with platform-specific scaling
        const fontWeightStr = String(textItem.fontWeight);
        
        // IMPORTANT: Use the exact same font size multiplier for all platforms
        // This ensures consistent text size between preview and download
        const exactFontSize = textItem.fontSize * (mode === 'download' ? 4 : 1);
        
        ctx.font = `${fontWeightStr} ${exactFontSize}px "${textItem.font}"`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = textItem.opacity;
        
        // Apply glow effect with platform-specific parameters
        if (textItem.glowIntensity > 0) {
          // IMPORTANT: Use consistent glow parameters
          const glowSteps = 10;
          const maxBlur = textItem.glowIntensity * (mode === 'download' ? 4 : 1);
          
          for (let i = 1; i <= glowSteps; i++) {
            ctx.save();
            ctx.shadowColor = textItem.glowColor;
            ctx.shadowBlur = (maxBlur / glowSteps) * i;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.fillStyle = textItem.fontColor;
            
            // Draw multiple times for stronger glow
            for (let j = 0; j < 5; j++) {
              ctx.fillText(textItem.text, 0, 0);
            }
            ctx.restore();
          }
        } else {
          // Add shadow for depth if no glow
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = mode === 'download' ? 20 : 5;
          ctx.shadowOffsetX = mode === 'download' ? 8 : 2;
          ctx.shadowOffsetY = mode === 'download' ? 8 : 2;
        }
        
        // Apply outline effect with platform-specific parameters
        if (textItem.outlineWeight > 0) {
          // IMPORTANT: Use consistent outline weight
          const outlineWidth = textItem.outlineWeight * (mode === 'download' ? 4 : 1);
          ctx.lineWidth = outlineWidth;
          ctx.strokeStyle = textItem.outlineColor;
          ctx.miterLimit = 2;
          ctx.lineJoin = 'round';
          
          // Reset shadow for clean outline
          ctx.shadowColor = 'rgba(0,0,0,0)';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
          
          // Draw multiple outlines with slight offsets for better visibility
          const outlineOffsets = [
            [0, 0], [0, 1], [1, 0], [0, -1], [-1, 0],
            [1, 1], [-1, -1], [1, -1], [-1, 1],
            [0, 2], [2, 0], [0, -2], [-2, 0]  // Add more distant offsets for thicker appearance
          ];
          
          outlineOffsets.forEach(([dx, dy]) => {
            // Scale the offsets for download mode
            const scaledDx = mode === 'download' ? dx * 4 : dx;
            const scaledDy = mode === 'download' ? dy * 4 : dy;
            ctx.strokeText(textItem.text, scaledDx, scaledDy);
          });
        }
        
        // Finally draw the text on top
        ctx.shadowColor = 'rgba(0,0,0,0)';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = textItem.fontColor;
        
        // Draw multiple times for stronger text
        for (let i = 0; i < 3; i++) {
          ctx.fillText(textItem.text, 0, 0);
        }
        
        // Restore the state
        ctx.restore();
        console.log(`Text layer ${index + 1} drawn: "${textItem.text}"`);
      });
      
      // If we have a subject image, draw it on top
      if (subjectImageUrl) {
        console.log('Drawing subject image');
        const loadAndDrawSubject = async () => {
          return new Promise<void>((resolve, reject) => {
            const subjectImg = new Image();
            subjectImg.crossOrigin = 'anonymous';
            
            subjectImg.onload = () => {
              try {
                console.log('Subject image loaded successfully:', subjectImg.width, 'x', subjectImg.height);
                
                // Calculate dimensions for subject
                const subjectAspect = subjectImg.width / subjectImg.height;
                let subDrawWidth, subDrawHeight, subOffsetX, subOffsetY;
                
                if (subjectAspect > 1) {
                  subDrawWidth = canvas.width;
                  subDrawHeight = canvas.width / subjectAspect;
                  subOffsetX = 0;
                  subOffsetY = (canvas.height - subDrawHeight) / 2;
                } else {
                  subDrawHeight = canvas.height;
                  subDrawWidth = canvas.height * subjectAspect;
                  subOffsetX = (canvas.width - subDrawWidth) / 2;
                  subOffsetY = 0;
                }
                
                // Draw subject image on top of text
                ctx.drawImage(subjectImg, subOffsetX, subOffsetY, subDrawWidth, subDrawHeight);
                console.log('Subject image drawn successfully');
                resolve();
              } catch (err) {
                console.error('Error drawing subject:', err);
                // Don't reject - continue without subject
                resolve();
              }
            };
            
            subjectImg.onerror = (err) => {
              console.error('Failed to load subject image:', err);
              // Don't reject - continue without subject
              resolve();
            };
            
            subjectImg.src = subjectImageUrl;
            
            // Set a timeout to resolve anyway if image loading takes too long
            setTimeout(() => {
              if (!subjectImg.complete) {
                console.warn('Subject image loading timed out');
                resolve();
              }
            }, 5000);
          });
        };
        
        await loadAndDrawSubject();
      }
      
      // Convert to data URL and return
      const dataUrl = canvas.toDataURL('image/png');
      console.log('Canvas rendered to data URL successfully, length:', dataUrl.length);
      return dataUrl;
    } catch (err) {
      console.error('Error in universal renderer:', err);
      return null;
    }
  };

  // Function to process and download the image
  const processAndDownload = async () => {
    try {
      setError('Preparing image for download...');
      
      // Detect device
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isAndroid = /Android/.test(navigator.userAgent);
      
      // Get active image URL - IMPORTANT: Always use originalImage as background
      const backgroundImageUrl = originalImage;
      if (!backgroundImageUrl) {
        setError('No image to download');
        return;
      }
      
      console.log('Starting image download process with background:', backgroundImageUrl.substring(0, 50) + '...');
      
      // Use universal renderer for consistent text on all platforms
      const rawDataUrl = await universalTextImageRender(
        backgroundImageUrl,
        processedImage && processedImage !== originalImage ? processedImage : null, // Use processed image as subject if available
        texts,
        isIOS,
        isAndroid,
        'download'
      );
      
      if (!rawDataUrl) {
        throw new Error('Failed to render image');
      }
      
      console.log('Image rendered successfully, now cropping transparent edges');
      
      // Crop transparent edges from the left and right sides
      const croppedDataUrl = await cropTransparentEdges(rawDataUrl);
      
      console.log('Final image prepared, data URL length:', croppedDataUrl.length);
      
      // Download the image using platform-specific method
      downloadImage(croppedDataUrl);
      setError(null);
      
      // Show success message
      setSuccessMessage('Image downloaded successfully!');
      
      // Auto-hide the success message after 5 seconds
      setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
    } catch (err) {
      console.error('Error in finish and download:', err);
      // Type check the error before accessing message property
      setError(`Failed to download image: ${err instanceof Error ? err.message : 'Unknown error occurred'}`);
      
      // Fallback to html2canvas if universal renderer fails
      fallbackToHtml2Canvas();
    }
  };

  // Simple function to trigger the download process
  const takeScreenshot = useCallback(() => {
    // Detect device
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    
    // Show loading message
    setError('Preparing image for download...');
    setSuccessMessage(null);
    
    // Get active image URL - IMPORTANT: Always use originalImage as background
    const backgroundImageUrl = originalImage;
    if (!backgroundImageUrl) {
      setError('No image to download');
      return;
    }
    
    console.log('Starting image capture with background:', backgroundImageUrl.substring(0, 50) + '...');
    
    // Use the universal renderer to create a consistent image
    universalTextImageRender(
      backgroundImageUrl,
      processedImage && processedImage !== originalImage ? processedImage : null, // Use processed image as subject if available
      texts,
      isIOS,
      isAndroid,
      'download'
    )
    .then(rawDataUrl => {
      if (!rawDataUrl) {
        throw new Error('Failed to render image');
      }
      
      console.log('Image rendered successfully, now cropping transparent edges');
      
      // Crop transparent edges from the left and right sides
      return cropTransparentEdges(rawDataUrl);
    })
    .then(croppedDataUrl => {
      console.log('Final image prepared, data URL length:', croppedDataUrl.length);
      
      // Download the image using our enhanced download function
      downloadImage(croppedDataUrl);
      setError(null);
      
      // Show success message
      setSuccessMessage('Image downloaded successfully!');
      
      // Auto-hide the success message after 5 seconds
      setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
    })
    .catch(err => {
      console.error('Error in takeScreenshot:', err);
      setError(`Failed to download image: ${err instanceof Error ? err.message : 'Unknown error occurred'}`);
      
      // Fallback to html2canvas if universal renderer fails
      fallbackToHtml2Canvas();
    });
  }, [originalImage, processedImage, texts, fallbackToHtml2Canvas]);

  // Calculate dimensions for the preview
  const imageDimensions = imageSize && containerSize
    ? calculateImageDimensions(imageSize.width, imageSize.height, containerSize.width, containerSize.height)
    : null;

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp']
    },
    multiple: false
  });

  // Function to reset the state and go back to upload screen
  const goToHome = useCallback(() => {
    setOriginalImage(null);
    setProcessedImage(null);
    setTexts([{
      id: '1',
      text: "TextBIMG",
      font: "Arial",
      fontSize: 76,
      fontColor: "#ffffff",
      fontWeight: 400,
      glowIntensity: 0,
      glowColor: "#00aaff",
      outlineWeight: 2.5,
      outlineColor: "#ffffff",
      opacity: 1,
      positionX: 50,
      positionY: 40, // Moved up from 50 to 40 to be above the center
      rotation: 0,
      horizontalTilt: 0,
      verticalTilt: 0
    }]);
    setActiveTextId('1');
    setError(null);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center py-8 bg-gray-900 text-white">
      <h1 className="text-4xl font-bold mb-8 text-center">TextBIMG</h1>
      
      <div 
        ref={containerRef} 
        className="relative w-full max-w-2xl flex flex-col items-center"
      >
        {/* Upload area */}
        <div className={`border-2 border-dashed border-blue-400 rounded-md p-8 mb-4 w-full flex items-center justify-center ${originalImage ? 'hidden' : 'block'}`}>
          <div 
            {...getRootProps({className: 'dropzone w-full h-full flex flex-col items-center justify-center cursor-pointer'})}
          >
            <input {...getInputProps()} />
            <div className="text-center">
              <div className="text-blue-400 mb-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <p className="text-lg font-medium">Drop your image here</p>
              <p className="text-sm text-gray-400 mt-1">or click to browse files</p>
              <p className="text-xs text-gray-500 mt-2">Supported formats: PNG, JPG, JPEG, WEBP</p>
            </div>
          </div>
        </div>

        {/* Loading indicator with progress bar */}
        {isProcessing && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black bg-opacity-75 rounded">
            <div className="text-blue-400 mb-4">
              <svg className="animate-spin h-10 w-10" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <p className="text-lg font-medium">{error || 'Processing image...'}</p>
            
            {/* Progress Bar */}
            {processingProgress > 0 && (
              <div className="w-3/4 mt-4">
                <div className="bg-gray-700 rounded-full h-2.5">
                  <div 
                    className="bg-blue-500 h-2.5 rounded-full transition-all duration-300 ease-in-out" 
                    style={{width: `${processingProgress}%`}}
                  ></div>
                </div>
                <p className="text-sm text-center mt-2">{processingProgress}%</p>
              </div>
            )}
          </div>
        )}

        {/* Success message */}
        {successMessage && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-4 py-2 rounded shadow-lg">
            {successMessage}
          </div>
        )}

        {/* Error message */}
        {error && !isProcessing && (
          <div className="bg-red-500 text-white p-4 rounded mb-4 w-full">
            <div className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{error}</span>
            </div>
          </div>
        )}
        
        {/* Rest of the component */}
        {/* ... existing code ... */}
      </div>
    </div>
  );
} 