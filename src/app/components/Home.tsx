"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { removeBackground } from "@imgly/background-removal";
import html2canvas from 'html2canvas';

// Add image size limits and compression settings
const MAX_IMAGE_SIZE = 800; // Reduced maximum dimension for faster processing
const COMPRESSION_QUALITY = 0.6; // Slightly lower quality for faster processing

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
          const processedBlob = await removeBackground(optimizedFile, {
            progress: (progress: any) => {
              // Ensure progress is a valid number between 0-100
              const progressPercent = progress ? Math.round(progress * 100) : 0;
              setProcessingProgress(progressPercent);
              
              // Update error message with progress for better feedback
              if (progressPercent > 0 && progressPercent < 100) {
                setError(`Removing background: ${progressPercent}% complete. Please wait...`);
              }
            },
            model: 'isnet', // Use smallest model for fastest processing
            fetchArgs: { 
              cache: 'force-cache'  // Cache model files
            },
            debug: false
          });
          
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
          setError('Failed to remove background. Please try a different image or check your internet connection.');
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
      setError(`Failed to download image: ${err.message}`);
      
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
      setError(`Failed to download image: ${err.message}`);
      
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
    <main className="min-h-screen p-4 sm:p-8 bg-gray-900">
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideInLeft {
          from { transform: translateX(-10%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideInRight {
          from { transform: translateX(10%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideInUp {
          from { transform: translateY(10%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes glow {
          0%, 100% { text-shadow: 0 0 5px rgba(59, 130, 246, 0.5); }
          50% { text-shadow: 0 0 20px rgba(59, 130, 246, 0.8), 0 0 30px rgba(59, 130, 246, 0.6); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out forwards;
        }
        .animate-slideInLeft {
          animation: slideInLeft 0.5s ease-out forwards;
        }
        .animate-slideInRight {
          animation: slideInRight 0.5s ease-out forwards;
        }
        .animate-slideInUp {
          animation: slideInUp 0.5s ease-out forwards;
        }
        .animate-pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .animate-glow {
          animation: glow 2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin 3s linear infinite;
        }
        /* Add smooth transitions for all interactive elements */
        button, input, select {
          transition: all 0.2s ease-in-out;
        }
        /* Custom slider styling */
        input[type="range"] {
          height: 6px;
          border-radius: 5px;
          appearance: none;
          background-color: #e5e7eb;
          outline: none;
        }
        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 0 5px rgba(0,0,0,0.2);
        }
        input[type="range"]::-webkit-slider-thumb:hover {
          transform: scale(1.2);
          background: #2563eb;
        }
        /* Add confetti animation for success message */
        @keyframes confetti {
          0% { transform: translateY(0) rotate(0); opacity: 1; }
          100% { transform: translateY(100px) rotate(720deg); opacity: 0; }
        }
        
        .confetti-container {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 9999;
          overflow: hidden;
        }
        
        .confetti {
          position: absolute;
          width: 10px;
          height: 10px;
          background-color: #3b82f6;
          opacity: 0.8;
          animation: confetti 3s ease-in-out forwards;
        }
        
        /* Add floating animation for upload icon */
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
        
        /* Add shine effect for buttons */
        @keyframes shine {
          0% { background-position: -100px; }
          20% { background-position: 200px; }
          100% { background-position: 200px; }
        }
        
        .btn-shine {
          position: relative;
          overflow: hidden;
        }
        
        .btn-shine::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0) 100%);
          transform: skewX(-25deg);
          animation: shine 3s infinite;
          background-position: -100px;
        }
        
        /* Enhanced text rendering styles */
        .text-layer {
          transform-style: preserve-3d;
          backface-visibility: hidden;
          will-change: transform, opacity;
        }
        
        .text-content {
          transform-style: preserve-3d;
          backface-visibility: hidden;
          will-change: transform, opacity, text-shadow;
          letter-spacing: 0.5px;
          font-smooth: always;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: optimizeLegibility;
        }

        /* Custom scrollbar styles */
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #1f2937;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #4b5563;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #6b7280;
        }

        /* Hide scrollbar but keep functionality */
        .hide-scrollbar {
          -ms-overflow-style: none;  /* IE and Edge */
          scrollbar-width: none;  /* Firefox */
        }
        
        .hide-scrollbar::-webkit-scrollbar {
          display: none;  /* Chrome, Safari and Opera */
        }
      `}</style>
      {isClient && (
      <div className="max-w-4xl mx-auto dark">
          {/* Success message - made more mobile friendly */}
          {successMessage && (
            <div className="fixed top-2 sm:top-4 left-4 right-4 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 bg-green-900 border border-green-700 text-green-300 px-4 py-3 rounded shadow-lg z-50 animate-fadeIn">
              <div className="flex items-center justify-center">
                <svg className="w-5 h-5 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
                {successMessage}
              </div>
            </div>
          )}
          
          {/* Header - Logo and buttons */}
          <div className="flex flex-col gap-4 mb-4 sm:mb-8">
            {/* Logo */}
            <h1 
              className="text-3xl sm:text-4xl font-bold cursor-pointer hover:text-blue-600 transition-colors animate-glow text-white text-center"
              onClick={goToHome}
              title="Go to home page"
            >
              TextBIMG
            </h1>

            {/* Action buttons */}
            {processedImage && !isProcessing && (
              <div className="flex space-x-2 animate-fadeIn w-full justify-center">
                <button
                  onClick={processAndDownload}
                  className="px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded hover:from-green-600 hover:to-green-700 transition-all transform hover:scale-105 shadow-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 btn-shine border-0"
                >
                  <div className="flex items-center justify-center">
                    <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                    </svg>
                    Download
                  </div>
                </button>
                <button
                  onClick={goToHome}
                  className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded hover:from-blue-600 hover:to-blue-700 transition-all transform hover:scale-105 shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 btn-shine border-0"
                >
                  <div className="flex items-center justify-center">
                    <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7m-7-7v14"></path>
                    </svg>
                    Home
                  </div>
                </button>
              </div>
            )}
          </div>
          
          {/* Upload area - mobile optimized */}
          {!processedImage && !isProcessing && (
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-6 sm:p-12 text-center cursor-pointer transition-all duration-300 transform hover:scale-[1.01] hover:shadow-lg ${
                isDragActive 
                  ? 'border-blue-500 bg-blue-900/20 scale-[1.02]' 
                  : 'border-gray-600 hover:border-gray-500'
              } animate-fadeIn`}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center">
                <div className="animate-float mb-4">
                  <svg className="w-16 sm:w-20 h-16 sm:h-20 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                  </svg>
                </div>
                <h2 className="text-lg sm:text-xl font-medium mb-2 text-gray-200">Drop your image here</h2>
                <p className="text-gray-400 mb-4">or click to browse files</p>
                <p className="text-xs text-gray-500 mt-4">Supported formats: PNG, JPG, JPEG, WEBP</p>
              </div>
            </div>
          )}

          {/* Processing status - mobile optimized */}
          {isProcessing && (
            <div className="mt-4 sm:mt-8 animate-fadeIn">
              <div className="flex flex-col items-center justify-center mb-4 sm:mb-6">
                <div className="relative">
                  <div className="animate-spin rounded-full h-12 sm:h-16 w-12 sm:w-16 border-4 border-gray-700"></div>
                  <div 
                    className="absolute top-0 left-0 rounded-full h-12 sm:h-16 w-12 sm:w-16 border-t-4 border-blue-500 animate-spin"
                    style={{ animationDuration: '1s' }}
                  ></div>
                </div>
                <div className="mt-4 text-base sm:text-lg font-medium text-gray-200 text-center px-4">
                  {processingProgress < 5 ? 'Optimizing image...' : 
                   processingProgress < 20 ? 'Initializing AI model...' : 
                   processingProgress < 95 ? `Removing background: ${isNaN(processingProgress) ? 0 : processingProgress}%` :
                   'Finalizing...'}
                </div>
              </div>
              <div className="w-full max-w-md mx-auto px-4">
                <div className="h-2 sm:h-3 bg-gray-700 rounded-full overflow-hidden shadow-inner">
                  <div
                    className="h-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-300 rounded-full"
                    style={{ width: `${isNaN(processingProgress) ? 0 : processingProgress}%` }}
                  />
                </div>
                {processingProgress > 0 && processingProgress < 95 && (
                  <div className="mt-4 bg-blue-900/20 border-blue-800 p-3 rounded-lg border animate-pulse">
                    <div className="flex items-center justify-center">
                      <svg className="w-5 h-5 mr-2 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                      </svg>
                      <p className="text-sm text-blue-300 text-center">
                        Please wait while we process your image...
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error message - mobile optimized */}
          {error && (
            <div className="mt-4 p-4 bg-blue-900/20 text-blue-300 border-blue-800 rounded border shadow-sm animate-fadeIn mx-4 sm:mx-0">
              <div className="flex items-center justify-center text-center">
                <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"></path>
                </svg>
                <span>{error}</span>
              </div>
            </div>
          )}

          {/* Image preview and controls - mobile optimized */}
          {processedImage && !isProcessing && (
            <div className="mt-4 sm:mt-8 animate-fadeIn">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-8">
                {/* Toolbar - vertical on desktop, horizontal on mobile */}
                <div className="md:col-span-3 md:order-1 order-2">
                  {/* Control panels - horizontal on mobile, vertical on desktop */}
                  <div className="overflow-x-auto md:overflow-x-visible pb-1 sm:pb-2 mb-2 sm:mb-4 hide-scrollbar">
                    <div className="flex md:flex-col space-x-2 md:space-x-0 md:space-y-2 sm:space-x-3 min-w-max md:min-w-0">
                      <button 
                        className={`p-3 sm:p-4 ${activeEditTool === 'text' ? 'bg-black' : 'bg-gray-800'} border-gray-700 rounded-lg shadow-sm border flex flex-col items-center justify-center min-w-[65px] sm:min-w-[80px] md:w-full`}
                        onClick={() => setActiveEditTool('text')}
                      >
                        <div className="text-xl sm:text-2xl mb-1 sm:mb-2">Aa</div>
                        <div className="text-xs sm:text-sm text-gray-400">Text</div>
                      </button>
                      <button 
                        className={`p-3 sm:p-4 ${activeEditTool === 'font' ? 'bg-black' : 'bg-gray-800'} border-gray-700 rounded-lg shadow-sm border flex flex-col items-center justify-center min-w-[65px] sm:min-w-[80px] md:w-full`}
                        onClick={() => setActiveEditTool('font')}
                      >
                        <div className="text-xl sm:text-2xl mb-1 sm:mb-2">T</div>
                        <div className="text-xs sm:text-sm text-gray-400">Font</div>
                      </button>
                      <button 
                        className={`p-3 sm:p-4 ${activeEditTool === 'color' ? 'bg-black' : 'bg-gray-800'} border-gray-700 rounded-lg shadow-sm border flex flex-col items-center justify-center min-w-[65px] sm:min-w-[80px] md:w-full`}
                        onClick={() => setActiveEditTool('color')}
                      >
                        <div className="text-xl sm:text-2xl mb-1 sm:mb-2">
                          <svg className="w-6 h-6 sm:w-7 sm:h-7 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"></path>
                          </svg>
                        </div>
                        <div className="text-xs sm:text-sm text-gray-400">Color</div>
                      </button>
                      <button 
                        className={`p-3 sm:p-4 ${activeEditTool === 'glow' ? 'bg-black' : 'bg-gray-800'} border-gray-700 rounded-lg shadow-sm border flex flex-col items-center justify-center min-w-[65px] sm:min-w-[80px] md:w-full`}
                        onClick={() => setActiveEditTool('glow')}
                      >
                        <div className="text-xl sm:text-2xl mb-1 sm:mb-2">
                          <svg className="w-6 h-6 sm:w-7 sm:h-7 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path>
                          </svg>
                        </div>
                        <div className="text-xs sm:text-sm text-gray-400">Glow</div>
                      </button>
                      <button 
                        className={`p-3 sm:p-4 ${activeEditTool === 'position' ? 'bg-black' : 'bg-gray-800'} border-gray-700 rounded-lg shadow-sm border flex flex-col items-center justify-center min-w-[65px] sm:min-w-[80px] md:w-full`}
                        onClick={() => setActiveEditTool('position')}
                      >
                        <div className="text-xl sm:text-2xl mb-1 sm:mb-2">
                          <svg className="w-6 h-6 sm:w-7 sm:h-7 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path>
                          </svg>
                        </div>
                        <div className="text-xs sm:text-sm text-gray-400">Position</div>
                      </button>
                      <button 
                        className={`p-3 sm:p-4 ${activeEditTool === 'size' ? 'bg-black' : 'bg-gray-800'} border-gray-700 rounded-lg shadow-sm border flex flex-col items-center justify-center min-w-[65px] sm:min-w-[80px] md:w-full`}
                        onClick={() => setActiveEditTool('size')}
                      >
                        <div className="text-xl sm:text-2xl mb-1 sm:mb-2">
                          <svg className="w-6 h-6 sm:w-7 sm:h-7 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7"></path>
                          </svg>
                        </div>
                        <div className="text-xs sm:text-sm text-gray-400">Size</div>
                      </button>
                      <button 
                        className={`p-3 sm:p-4 ${activeEditTool === 'outline' ? 'bg-black' : 'bg-gray-800'} border-gray-700 rounded-lg shadow-sm border flex flex-col items-center justify-center min-w-[65px] sm:min-w-[80px] md:w-full`}
                        onClick={() => setActiveEditTool('outline')}
                      >
                        <div className="text-xl sm:text-2xl mb-1 sm:mb-2">
                          <span className="font-bold">B</span>
                        </div>
                        <div className="text-xs sm:text-sm text-gray-400">Outline</div>
                      </button>
                      <button 
                        className={`p-3 sm:p-4 ${activeEditTool === 'opacity' ? 'bg-black' : 'bg-gray-800'} border-gray-700 rounded-lg shadow-sm border flex flex-col items-center justify-center min-w-[65px] sm:min-w-[80px] md:w-full`}
                        onClick={() => setActiveEditTool('opacity')}
                      >
                        <div className="text-xl sm:text-2xl mb-1 sm:mb-2">
                          <svg className="w-6 h-6 sm:w-7 sm:h-7 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                          </svg>
                        </div>
                        <div className="text-xs sm:text-sm text-gray-400">Opacity</div>
                      </button>
                      <button 
                        className={`p-3 sm:p-4 ${activeEditTool === 'rotate' ? 'bg-black' : 'bg-gray-800'} border-gray-700 rounded-lg shadow-sm border flex flex-col items-center justify-center min-w-[65px] sm:min-w-[80px] md:w-full`}
                        onClick={() => setActiveEditTool('rotate')}
                      >
                        <div className="text-xl sm:text-2xl mb-1 sm:mb-2">
                          <svg className="w-6 h-6 sm:w-7 sm:h-7 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                          </svg>
                        </div>
                        <div className="text-xs sm:text-sm text-gray-400">Rotate</div>
                      </button>
                      <button 
                        className={`p-3 sm:p-4 ${activeEditTool === 'tiltX' ? 'bg-black' : 'bg-gray-800'} border-gray-700 rounded-lg shadow-sm border flex flex-col items-center justify-center min-w-[65px] sm:min-w-[80px] md:w-full`}
                        onClick={() => setActiveEditTool('tiltX')}
                      >
                        <div className="text-xl sm:text-2xl mb-1 sm:mb-2">
                          <svg className="w-6 h-6 sm:w-7 sm:h-7 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path>
                          </svg>
                        </div>
                        <div className="text-xs sm:text-sm text-gray-400">Tilt X</div>
                      </button>
                      <button 
                        className={`p-3 sm:p-4 ${activeEditTool === 'tiltY' ? 'bg-black' : 'bg-gray-800'} border-gray-700 rounded-lg shadow-sm border flex flex-col items-center justify-center min-w-[65px] sm:min-w-[80px] md:w-full`}
                        onClick={() => setActiveEditTool('tiltY')}
                      >
                        <div className="text-xl sm:text-2xl mb-1 sm:mb-2">
                          <svg className="w-6 h-6 sm:w-7 sm:h-7 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"></path>
                          </svg>
                        </div>
                        <div className="text-xs sm:text-sm text-gray-400">Tilt Y</div>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Main content area - image preview and editing panels */}
                <div className="md:col-span-9 md:order-2 order-1 flex flex-col">
                  {/* Preview */}
                  <div>
                  <div
                    ref={containerRef}
                      className="relative w-full overflow-hidden rounded-lg shadow-xl animate-slideInRight mb-4 sm:mb-8 bg-gray-900"
                    style={getContainerStyle()}
                  >
                    {imageLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10">
                        <div className="flex flex-col items-center">
                          <div className="relative">
                            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200"></div>
                            <div 
                              className="absolute top-0 left-0 rounded-full h-12 w-12 border-t-4 border-blue-500 animate-spin"
                              style={{ animationDuration: '1s' }}
                            ></div>
                          </div>
                          <p className="text-white mt-4">Loading image...</p>
                        </div>
                      </div>
                    )}
                    <div
                      ref={imageContainerRef}
                      className="absolute inset-0"
                    >
                      {/* Layer 1: Original Background */}
                      {originalImage && (
                        <img
                          src={originalImage}
                          alt="Background"
                          className="absolute w-full h-full object-contain transition-opacity duration-300"
                          style={{
                            zIndex: 1,
                            visibility: 'visible',
                            opacity: imageLoading ? 0 : 1,
                            objectFit: 'contain',
                            objectPosition: 'center'
                          }}
                          onLoad={handleImageLoad}
                        />
                      )}

                        {/* Layer 2: Text Layers - Behind subject but above background */}
                      {texts.map((textItem) => (
                        <div 
                          key={textItem.id}
                          className="absolute inset-0 flex items-center justify-center p-4 text-layer"
                          style={{ 
                            zIndex: 2,
                            pointerEvents: 'none'
                          }}
                        >
                          <p
                            className="text-content"
                            style={{
                              fontFamily: textItem.font,
                              fontSize: `${textItem.fontSize}px`,
                              fontWeight: textItem.fontWeight,
                              color: textItem.fontColor,
                              opacity: textItem.opacity,
                              textAlign: 'center',
                              maxWidth: '100%',
                              wordWrap: 'break-word',
                              textShadow: textItem.glowIntensity > 0 
                                ? `0 0 ${textItem.glowIntensity/2}px ${textItem.glowColor}, 
                                   0 0 ${textItem.glowIntensity}px ${textItem.glowColor}, 
                                   0 0 ${textItem.glowIntensity*2}px ${textItem.glowColor}`
                                : '0 2px 4px rgba(0,0,0,0.5)',
                              WebkitTextStroke: textItem.outlineWeight > 0 
                                ? `${textItem.outlineWeight}px ${textItem.outlineColor}` 
                                : 'none',
                              userSelect: 'none',
                              position: 'absolute',
                              left: `${textItem.positionX}%`,
                              top: `${textItem.positionY}%`,
                              transform: `
                                translate(-50%, -50%) 
                                rotate(${textItem.rotation}deg)
                                skew(${textItem.horizontalTilt}deg, ${textItem.verticalTilt}deg)
                              `,
                              transformOrigin: 'center center',
                              WebkitTextStrokeWidth: textItem.outlineWeight === 0 ? '0.5px' : undefined,
                              WebkitTextStrokeColor: textItem.outlineWeight === 0 ? 'rgba(0,0,0,0.8)' : undefined
                            }}
                          >
                            {textItem.text}
                          </p>
                        </div>
                      ))}

                        {/* Layer 3: Subject (without background) - On top of text */}
                      {processedImage && (
                        <img
                          src={processedImage}
                          alt="Subject"
                          className="absolute w-full h-full object-contain transition-opacity duration-300"
                          style={{
                            zIndex: 3,
                            visibility: 'visible',
                            opacity: imageLoading ? 0 : 1,
                            objectFit: 'contain',
                            objectPosition: 'center'
                          }}
                          onLoad={handleImageLoad}
                        />
                      )}
                    </div>
                  </div>
                </div>

                  {/* Editing panels - show based on activeEditTool */}
                  <div className="mb-4 animate-fadeIn">
                    {/* Text editing panel */}
                    {activeEditTool === 'text' && (
                      <div className="p-3 sm:p-4 bg-gray-800 rounded-lg shadow-sm border border-gray-700">
                        <label className="block text-sm sm:text-base text-gray-300 mb-2">Edit Text</label>
                        <textarea
                          value={getActiveText().text}
                          onChange={(e) => updateActiveText({ text: e.target.value })}
                          className="w-full px-3 py-2 sm:px-4 sm:py-3 bg-gray-700 border border-gray-600 rounded text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          rows={2}
                        />
                        <div className="flex justify-between mt-3">
                          <button
                            onClick={removeActiveText}
                            className="px-3 py-2 bg-red-500 rounded hover:bg-red-600 transition-colors transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 text-white text-sm"
                            disabled={texts.length <= 1}
                            title="Remove text"
                          >
                            <div className="flex items-center">
                              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                              </svg>
                              Remove Text
                            </div>
                          </button>
                    <select
                      value={activeTextId}
                      onChange={(e) => setActiveTextId(e.target.value)}
                            className="px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-gray-700 border-gray-600 text-gray-200 text-sm"
                    >
                      {texts.map((t, index) => (
                        <option key={t.id} value={t.id} className="text-gray-200">
                          Text {index + 1}: {t.text.substring(0, 15)}{t.text.length > 15 ? '...' : ''}
                        </option>
                      ))}
                    </select>
                    </div>
                  </div>
                    )}

                    {/* Font selection panel */}
                    {activeEditTool === 'font' && (
                      <div className="p-3 sm:p-4 bg-gray-800 rounded-lg shadow-sm border border-gray-700">
                        <div className="mb-3">
                          <label className="block text-sm sm:text-base text-gray-300 mb-2">Font Family</label>
                    <select
                      value={getActiveText().font}
                      onChange={(e) => updateActiveText({ font: e.target.value })}
                            className="w-full px-3 py-2 sm:px-4 sm:py-3 bg-gray-700 border border-gray-600 rounded text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          >
                            <option value="Arial">Arial</option>
                            <option value="Verdana">Verdana</option>
                            <option value="Helvetica">Helvetica</option>
                            <option value="Times New Roman">Times New Roman</option>
                            <option value="Courier New">Courier New</option>
                            <option value="Georgia">Georgia</option>
                            <option value="Palatino">Palatino</option>
                            <option value="Garamond">Garamond</option>
                            <option value="Bookman">Bookman</option>
                            <option value="Comic Sans MS">Comic Sans MS</option>
                            <option value="Trebuchet MS">Trebuchet MS</option>
                            <option value="Impact">Impact</option>
                    </select>
                  </div>
                        <div>
                          <label className="block text-sm sm:text-base text-gray-300 mb-2">Font Weight: {getActiveText().fontWeight}</label>
                        <input
                          type="range"
                            min="100"
                            max="900"
                            step="100"
                            value={getActiveText().fontWeight}
                            onChange={(e) => updateActiveText({ fontWeight: parseInt(e.target.value) })}
                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                      </div>
                    )}

                    {/* Color panel */}
                    {activeEditTool === 'color' && (
                      <div className="p-3 sm:p-4 bg-gray-800 rounded-lg shadow-sm border border-gray-700">
                        <label className="block text-sm sm:text-base text-gray-300 mb-2">Text Color</label>
                        <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={getActiveText().fontColor}
                        onChange={(e) => updateActiveText({ fontColor: e.target.value })}
                        className="w-12 h-10 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={getActiveText().fontColor}
                        onChange={(e) => updateActiveText({ fontColor: e.target.value })}
                            className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      />
                    </div>
                  </div>
                    )}

                    {/* Glow panel */}
                    {activeEditTool === 'glow' && (
                      <div className="p-3 sm:p-4 bg-gray-800 rounded-lg shadow-sm border border-gray-700">
                        <div className="mb-3">
                          <label className="block text-sm sm:text-base text-gray-300 mb-2">Glow Intensity: {getActiveText().glowIntensity}</label>
                          <input
                            type="range"
                            min="0"
                            max="30"
                            value={getActiveText().glowIntensity}
                            onChange={(e) => updateActiveText({ glowIntensity: parseInt(e.target.value) })}
                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="block text-sm sm:text-base text-gray-300 mb-2">Glow Color</label>
                          <div className="flex items-center gap-3">
                          <input
                            type="color"
                            value={getActiveText().glowColor}
                            onChange={(e) => updateActiveText({ glowColor: e.target.value })}
                            className="w-12 h-10 rounded cursor-pointer"
                          />
                          <input
                            type="text"
                            value={getActiveText().glowColor}
                            onChange={(e) => updateActiveText({ glowColor: e.target.value })}
                              className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          />
                        </div>
                      </div>
                    </div>
                    )}

                    {/* Position panel */}
                    {activeEditTool === 'position' && (
                      <div className="p-3 sm:p-4 bg-gray-800 rounded-lg shadow-sm border border-gray-700">
                        <div className="mb-3">
                          <label className="block text-sm sm:text-base text-gray-300 mb-2">Horizontal Position: {getActiveText().positionX}%</label>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={getActiveText().positionX}
                            onChange={(e) => updateActiveText({ positionX: parseInt(e.target.value) })}
                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="block text-sm sm:text-base text-gray-300 mb-2">Vertical Position: {getActiveText().positionY}%</label>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={getActiveText().positionY}
                            onChange={(e) => updateActiveText({ positionY: parseInt(e.target.value) })}
                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                      </div>
                    )}

                    {/* Size panel */}
                    {activeEditTool === 'size' && (
                      <div className="p-3 sm:p-4 bg-gray-800 rounded-lg shadow-sm border border-gray-700">
                        <label className="block text-sm sm:text-base text-gray-300 mb-2">Font Size: {getActiveText().fontSize}px</label>
                        <input
                          type="range"
                          min="12"
                          max="120"
                          value={getActiveText().fontSize}
                          onChange={(e) => updateActiveText({ fontSize: parseInt(e.target.value) })}
                          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                    )}

                    {/* Outline panel */}
                    {activeEditTool === 'outline' && (
                      <div className="p-3 sm:p-4 bg-gray-800 rounded-lg shadow-sm border border-gray-700">
                        <div className="mb-3">
                          <label className="block text-sm sm:text-base text-gray-300 mb-2">Outline Weight: {getActiveText().outlineWeight}px</label>
                          <input
                            type="range"
                            min="0"
                            max="10"
                            step="0.5"
                            value={getActiveText().outlineWeight}
                            onChange={(e) => updateActiveText({ outlineWeight: parseFloat(e.target.value) })}
                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="block text-sm sm:text-base text-gray-300 mb-2">Outline Color</label>
                          <div className="flex items-center gap-3">
                          <input
                            type="color"
                            value={getActiveText().outlineColor}
                            onChange={(e) => updateActiveText({ outlineColor: e.target.value })}
                            className="w-12 h-10 rounded cursor-pointer"
                          />
                          <input
                            type="text"
                            value={getActiveText().outlineColor}
                            onChange={(e) => updateActiveText({ outlineColor: e.target.value })}
                              className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          />
                        </div>
                      </div>
                    </div>
                    )}

                    {/* Opacity panel */}
                    {activeEditTool === 'opacity' && (
                      <div className="p-3 sm:p-4 bg-gray-800 rounded-lg shadow-sm border border-gray-700">
                        <label className="block text-sm sm:text-base text-gray-300 mb-2">Opacity: {Math.round(getActiveText().opacity * 100)}%</label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={getActiveText().opacity}
                          onChange={(e) => updateActiveText({ opacity: parseFloat(e.target.value) })}
                          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                    )}

                    {/* Rotation panel */}
                    {activeEditTool === 'rotate' && (
                      <div className="p-3 sm:p-4 bg-gray-800 rounded-lg shadow-sm border border-gray-700">
                        <label className="block text-sm sm:text-base text-gray-300 mb-2">Rotation: {getActiveText().rotation}°</label>
                          <input
                            type="range"
                            min="-180"
                            max="180"
                            value={getActiveText().rotation}
                          onChange={(e) => updateActiveText({ rotation: parseInt(e.target.value) })}
                          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                    )}

                    {/* Horizontal Tilt panel */}
                    {activeEditTool === 'tiltX' && (
                      <div className="p-3 sm:p-4 bg-gray-800 rounded-lg shadow-sm border border-gray-700">
                        <label className="block text-sm sm:text-base text-gray-300 mb-2">Horizontal Tilt: {getActiveText().horizontalTilt}°</label>
                            <input
                              type="range"
                              min="-45"
                              max="45"
                              value={getActiveText().horizontalTilt}
                          onChange={(e) => updateActiveText({ horizontalTilt: parseInt(e.target.value) })}
                          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                    )}

                    {/* Vertical Tilt panel */}
                    {activeEditTool === 'tiltY' && (
                      <div className="p-3 sm:p-4 bg-gray-800 rounded-lg shadow-sm border border-gray-700">
                        <label className="block text-sm sm:text-base text-gray-300 mb-2">Vertical Tilt: {getActiveText().verticalTilt}°</label>
                            <input
                              type="range"
                              min="-45"
                              max="45"
                              value={getActiveText().verticalTilt}
                          onChange={(e) => updateActiveText({ verticalTilt: parseInt(e.target.value) })}
                          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                    )}
                  </div>

                  {/* Download and Add Text buttons - mobile optimized */}
                  <div className="mt-4 mb-8 flex flex-col sm:flex-row justify-center gap-3">
                    <button
                      onClick={addNewText}
                      className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 shadow-md btn-shine text-base order-2 sm:order-1 border-0"
                    >
                      <div className="flex items-center justify-center">
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                        </svg>
                        Add Text
                      </div>
                    </button>
                  <button
                    onClick={processAndDownload}
                      className="px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 shadow-md btn-shine text-base order-1 sm:order-2 border-0"
                  >
                    <div className="flex items-center justify-center">
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                      </svg>
                      Download Image
                    </div>
                  </button>
                  </div>
                </div>
              </div>
            </div>
          )}
      </div>
      )}
    </main>
  );
} 