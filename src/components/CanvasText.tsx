import React, { useEffect, useRef } from 'react';

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

  useEffect(() => {
    let animationFrameId: number;
    let lastTime = 0;
    let cursorVisible = true;

    const renderCanvas = (time: number) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Handle cursor blinking (toggle every 500ms)
      if (time - lastTime > 500) {
        cursorVisible = !cursorVisible;
        lastTime = time;
      }

      // Handle high DPI displays for sharp text
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) {
        animationFrameId = requestAnimationFrame(renderCanvas);
        return;
      }
      
      canvas.width = rect.width * dpr;
      
      // Calculate height based on text wrapping
      const displayText = text || placeholder || '';
      const isPlaceholder = !text && !!placeholder;
      
      ctx.font = isPlaceholder ? `italic ${font}` : font;
      const lines: string[] = [];
      const paragraphs = (displayText || '').split('\n');
      
      const maxWidth = rect.width;
      
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
      
      // Set canvas height and scale
      canvas.height = height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${height}px`;
      
      ctx.scale(dpr, dpr);
      
      // Clear and Setup Context
      ctx.clearRect(0, 0, rect.width, height);
      ctx.font = isPlaceholder ? `italic ${font}` : font;
      ctx.fillStyle = isPlaceholder ? '#57534e' : color; 
      ctx.textBaseline = 'top';
      
      // Draw text
      lines.forEach((line, index) => {
        ctx.fillText(line, 0, index * fontSize * lineHeight);
      });

      // Draw cursor
      if (showCursor && !isPlaceholder && cursorVisible) {
        const lastLine = lines[lines.length - 1] || '';
        const metrics = ctx.measureText(lastLine);
        const cursorX = metrics.width + 2;
        const cursorY = (lines.length - 1) * fontSize * lineHeight;
        
        ctx.fillStyle = '#f59e0b'; // amber-500
        ctx.fillRect(cursorX, cursorY + fontSize * 0.1, 1.5, fontSize * 1.1);
      } else if (showCursor && isPlaceholder && cursorVisible) {
        // Draw cursor at beginning if there is no text yet
        ctx.fillStyle = '#f59e0b'; // amber-500
        ctx.fillRect(0, fontSize * 0.1, 1.5, fontSize * 1.1);
      }

      animationFrameId = requestAnimationFrame(renderCanvas);
    };

    animationFrameId = requestAnimationFrame(renderCanvas);
    
    return () => cancelAnimationFrame(animationFrameId);
  }, [text, placeholder, font, color, lineHeight, showCursor]);

  return (
    <div ref={containerRef} className={`w-full overflow-hidden ${className}`}>
      <canvas ref={canvasRef} className="block pointer-events-none" />
    </div>
  );
}
