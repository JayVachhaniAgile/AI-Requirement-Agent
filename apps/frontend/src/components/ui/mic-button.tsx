import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MicButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export function MicButton({ onTranscript, disabled }: MicButtonProps) {
  const [isListening, setIsListening] = useState(false);
  const [notSupported, setNotSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined" &&
        !("SpeechRecognition" in window) &&
        !("webkitSpeechRecognition" in window)) {
      setNotSupported(true);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    stopListening();

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let finalText = "";

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript;
        }
      }
    };

    recognition.onerror = () => { setIsListening(false); };
    recognition.onend = () => {
      setIsListening(false);
      if (finalText) {
        onTranscript(finalText + " ");
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
    }
  }, [onTranscript, stopListening]);

  useEffect(() => {
    return () => { stopListening(); };
  }, [stopListening]);

  const handleClick = () => {
    if (notSupported || disabled) return;
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const tooltipText = notSupported
    ? "Voice input (not available in this browser)"
    : isListening
    ? "Listening... click to stop"
    : "Click to speak";

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleClick}
            disabled={disabled || notSupported}
            className={`flex items-center justify-center w-8 h-8 rounded-full transition-all shadow-sm border ${
              isListening
                ? "bg-red-500 border-red-400 text-white animate-pulse shadow-red-400/40"
                : notSupported
                ? "bg-muted/30 border-border text-muted-foreground/30 cursor-not-allowed"
                : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:shadow-md"
            }`}
            title={tooltipText}
          >
            {isListening ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-xs">
          {tooltipText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
