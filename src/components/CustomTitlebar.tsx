import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Settings, Minus, Square, X, Bot, BarChart3, FileText, Network, Info, MoreVertical, Copy } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { TooltipProvider, TooltipSimple } from '@/components/ui/tooltip-modern';
import { isWindows } from '@/lib/platform';

interface CustomTitlebarProps {
  onSettingsClick?: () => void;
  onAgentsClick?: () => void;
  onUsageClick?: () => void;
  onClaudeClick?: () => void;
  onMCPClick?: () => void;
  onInfoClick?: () => void;
}

export const CustomTitlebar: React.FC<CustomTitlebarProps> = ({
  onSettingsClick,
  onAgentsClick,
  onUsageClick,
  onClaudeClick,
  onMCPClick,
  onInfoClick
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Track maximized state for Windows restore/maximize icon
  useEffect(() => {
    if (!isWindows) return;

    const appWindow = getCurrentWindow();

    // Check initial state
    appWindow.isMaximized().then(setIsMaximized);

    // Listen for resize events to track maximize/restore
    const unlisten = appWindow.onResized(async () => {
      const maximized = await appWindow.isMaximized();
      setIsMaximized(maximized);
    });

    return () => { unlisten.then(fn => fn()); };
  }, []);

  const handleMinimize = async () => {
    try {
      const window = getCurrentWindow();
      await window.minimize();
    } catch (error) {
      console.error('Failed to minimize window:', error);
    }
  };

  const handleMaximize = async () => {
    try {
      const window = getCurrentWindow();
      const maximized = await window.isMaximized();
      if (maximized) {
        await window.unmaximize();
      } else {
        await window.maximize();
      }
    } catch (error) {
      console.error('Failed to maximize/unmaximize window:', error);
    }
  };

  const handleClose = async () => {
    try {
      const window = getCurrentWindow();
      await window.close();
    } catch (error) {
      console.error('Failed to close window:', error);
    }
  };

  // Shared nav icons used by both layouts
  const navIcons = (
    <>
      {/* Primary actions group */}
      <div className="flex items-center gap-1">
        {onAgentsClick && (
          <TooltipSimple content="Agents" side="bottom">
            <motion.button
              onClick={onAgentsClick}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="p-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors tauri-no-drag"
            >
              <Bot size={16} />
            </motion.button>
          </TooltipSimple>
        )}

        {onUsageClick && (
          <TooltipSimple content="Usage Dashboard" side="bottom">
            <motion.button
              onClick={onUsageClick}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="p-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors tauri-no-drag"
            >
              <BarChart3 size={16} />
            </motion.button>
          </TooltipSimple>
        )}
      </div>

      {/* Visual separator */}
      <div className="w-px h-5 bg-border/50" />

      {/* Secondary actions group */}
      <div className="flex items-center gap-1">
        {onSettingsClick && (
          <TooltipSimple content="Settings" side="bottom">
            <motion.button
              onClick={onSettingsClick}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="p-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors tauri-no-drag"
            >
              <Settings size={16} />
            </motion.button>
          </TooltipSimple>
        )}

        {/* Dropdown menu for additional options */}
        <div className="relative" ref={dropdownRef}>
          <TooltipSimple content="More options" side="bottom">
            <motion.button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="p-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-1"
            >
              <MoreVertical size={16} />
            </motion.button>
          </TooltipSimple>

          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-popover border border-border rounded-lg shadow-lg z-[250]">
              <div className="py-1">
                {onClaudeClick && (
                  <button
                    onClick={() => {
                      onClaudeClick();
                      setIsDropdownOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-3"
                  >
                    <FileText size={14} />
                    <span>CLAUDE.md</span>
                  </button>
                )}

                {onMCPClick && (
                  <button
                    onClick={() => {
                      onMCPClick();
                      setIsDropdownOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-3"
                  >
                    <Network size={14} />
                    <span>MCP Servers</span>
                  </button>
                )}

                {onInfoClick && (
                  <button
                    onClick={() => {
                      onInfoClick();
                      setIsDropdownOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-3"
                  >
                    <Info size={14} />
                    <span>About</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );

  if (isWindows) {
    // Windows Fluent layout: [Nav Icons | separator | ─ □ ✕]
    return (
      <TooltipProvider>
      <div
        className="relative z-[200] h-8 bg-background/95 backdrop-blur-sm flex items-center justify-between select-none border-b border-border/50 tauri-drag"
        data-tauri-drag-region
      >
        {/* Left side - Navigation icons */}
        <div className="flex items-center pl-3 gap-3 tauri-no-drag">
          {navIcons}
        </div>

        {/* Right side - Windows caption buttons */}
        <div className="flex items-center h-full tauri-no-drag">
          {/* Minimize */}
          <button
            onClick={(e) => { e.stopPropagation(); handleMinimize(); }}
            className="w-[46px] h-full flex items-center justify-center hover:bg-foreground/10 transition-colors tauri-no-drag"
            title="Minimize"
          >
            <Minus size={16} className="text-foreground" />
          </button>

          {/* Maximize / Restore */}
          <button
            onClick={(e) => { e.stopPropagation(); handleMaximize(); }}
            className="w-[46px] h-full flex items-center justify-center hover:bg-foreground/10 transition-colors tauri-no-drag"
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? (
              <Copy size={14} className="text-foreground" />
            ) : (
              <Square size={14} className="text-foreground" />
            )}
          </button>

          {/* Close */}
          <button
            onClick={(e) => { e.stopPropagation(); handleClose(); }}
            className="w-[46px] h-full flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors tauri-no-drag"
            title="Close"
          >
            <X size={16} className="text-foreground" />
          </button>
        </div>
      </div>
      </TooltipProvider>
    );
  }

  // macOS layout: [Traffic Lights | ... | Nav Icons]
  return (
    <TooltipProvider>
    <div
      className="relative z-[200] h-11 bg-background/95 backdrop-blur-sm flex items-center justify-between select-none border-b border-border/50 tauri-drag"
      data-tauri-drag-region
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Left side - macOS Traffic Light buttons */}
      <div className="flex items-center space-x-2 pl-5">
        <div className="flex items-center space-x-2">
          {/* Close button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleClose();
            }}
            className="group relative w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-all duration-200 flex items-center justify-center tauri-no-drag"
            title="Close"
          >
            {isHovered && (
              <X size={8} className="text-red-900 opacity-60 group-hover:opacity-100" />
            )}
          </button>

          {/* Minimize button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleMinimize();
            }}
            className="group relative w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600 transition-all duration-200 flex items-center justify-center tauri-no-drag"
            title="Minimize"
          >
            {isHovered && (
              <Minus size={8} className="text-yellow-900 opacity-60 group-hover:opacity-100" />
            )}
          </button>

          {/* Maximize button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleMaximize();
            }}
            className="group relative w-3 h-3 rounded-full bg-green-500 hover:bg-green-600 transition-all duration-200 flex items-center justify-center tauri-no-drag"
            title="Maximize"
          >
            {isHovered && (
              <Square size={6} className="text-green-900 opacity-60 group-hover:opacity-100" />
            )}
          </button>
        </div>
      </div>

      {/* Right side - Navigation icons */}
      <div className="flex items-center pr-5 gap-3 tauri-no-drag">
        {navIcons}
      </div>
    </div>
    </TooltipProvider>
  );
};
