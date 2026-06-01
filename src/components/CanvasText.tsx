import React, { useEffect, useRef, useState } from 'react';

interface CanvasTextProps {
  text: string;
  placeholder?: string;
  className?: string;
  font?: string;
  color?: string;
  lineHeight?: number;
  showCursor?: boolean;
}

export function CanvasText({ 
  text, 
  placeholder, 
  className = '', 
  font = '16px Inter, sans-serif',
  color = '#e7e5e4', // text-stone-200
  lineHeight = 1.6,
  showCursor = false
}: CanvasTextProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Monitor container size dynamically via high-performance ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    let animationFrameId: number;
    let lastTime = 0;
    let cursorVisible = true;

    const renderCanvas = (time: number) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container || containerWidth <= 0) {
        animationFrameId = requestAnimationFrame(renderCanvas);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Handle cursor blinking (toggle every 500ms)
      if (time - lastTime > 500) {
        cursorVisible = !cursorVisible;
        lastTime = time;
      }

      // Handle high DPI displays for sharp text
      const dpr = window.devicePixelRatio || 1;
      const displayText = text || placeholder || '';
      const isPlaceholder = !text && !!placeholder;
      
      ctx.font = isPlaceholder ? `italic ${font}` : font;
      const lines: string[] = [];
      const paragraphs = (displayText || '').split('\n');
      
      const maxWidth = containerWidth;
      
      // Wrap text
      paragraphs.forEach((paragraph, index) => {
        let currentLine = '';
        const words = paragraph.split(' ');
        
        for (let i = 0; i < words.length; i++) {
          const testLine = currentLine + words[i] + (i < words.length - 1 ? ' ' : (index < paragraphs.length - 1 || text.endsWith(' ') ? ' ' : ''));
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxWidth && i > 0) {
            lines.push(currentLine);
            currentLine = words[i] + ' ';
          } else {
            currentLine = testLine;
          }
        }
        lines.push(currentLine);
      });

      // Calculate required height
      const fontSizeMatch = font.match(/(\d+(?:\.\d+)?)px/);
      const fontSize = fontSizeMatch ? parseFloat(fontSizeMatch[1]) : 16;
      
      // Add extra padding at bottom if cursor is shown to ensure it doesn't clip
      const height = lines.length * fontSize * lineHeight + (showCursor ? fontSize * 0.5 : 0);
      
      const targetWidth = Math.floor(containerWidth);
      const targetHeight = Math.floor(height);
      const targetCanvasWidth = targetWidth * dpr;
      const targetCanvasHeight = targetHeight * dpr;

      // CRITICAL GUARD: Only update canvas DOM size properties if they actually changed.
      // This completely eliminates layout thrashing ("elements shifting or moving") during continuous ticks.
      if (canvas.width !== targetCanvasWidth || canvas.height !== targetCanvasHeight) {
        canvas.width = targetCanvasWidth;
        canvas.height = targetCanvasHeight;
        canvas.style.width = `${targetWidth}px`;
        canvas.style.height = `${targetHeight}px`;
      }
      
      ctx.clearRect(0, 0, targetWidth, targetHeight);
      ctx.save();
      ctx.scale(dpr, dpr);
      
      ctx.font = isPlaceholder ? `italic ${font}` : font;
      ctx.fillStyle = isPlaceholder ? '#57534e' : color; 
      ctx.textBaseline = 'top';
      
      // Draw text
      lines.forEach((line, index) => {
        ctx.fillText(line, 0, index * fontSize * lineHeight);
      });

      // Draw cursor without triggering styles updates if visible
      if (showCursor && cursorVisible) {
        ctx.fillStyle = '#f59e0b'; // amber-500
        if (!isPlaceholder) {
          const lastLine = lines[lines.length - 1] || '';
          const metrics = ctx.measureText(lastLine);
          const cursorX = metrics.width + 2;
          const cursorY = (lines.length - 1) * fontSize * lineHeight;
          ctx.fillRect(cursorX, cursorY + fontSize * 0.1, 1.5, fontSize * 1.1);
        } else {
          ctx.fillRect(0, fontSize * 0.1, 1.5, fontSize * 1.1);
        }
      }

      ctx.restore();
      animationFrameId = requestAnimationFrame(renderCanvas);
    };

    animationFrameId = requestAnimationFrame(renderCanvas);
    
    return () => cancelAnimationFrame(animationFrameId);
  }, [text, placeholder, font, color, lineHeight, showCursor, containerWidth]);

  return (
    <div ref={containerRef} className={`w-full overflow-hidden ${className}`}>
      <canvas ref={canvasRef} className="block pointer-events-none" />
    </div>
  );
}
