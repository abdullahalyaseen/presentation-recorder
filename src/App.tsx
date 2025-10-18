import React, { useRef, useState, useEffect } from "react";

export default function PPTPresenterRecorder() {
  const canvasRef = useRef(null);
  const whiteboardRef = useRef(null);
  const videoRef = useRef(null);
  const [slides, setSlides] = useState([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioStream, setAudioStream] = useState(null);
  const [chunks, setChunks] = useState([]);
  const [drawing, setDrawing] = useState(false);
  const [color, setColor] = useState("#332673");
  const [lineWidth, setLineWidth] = useState(1);
  const [ctxWhiteboard, setCtxWhiteboard] = useState(null);
  const [videoReady, setVideoReady] = useState(false);

  // --- Setup camera and whiteboard canvas ---
  useEffect(() => {
    const setup = async () => {
      const canvas = canvasRef.current;
      const wb = whiteboardRef.current;
      canvas.width = 1280;
      canvas.height = 720;
      wb.width = 1280;
      wb.height = 720;

      // Get camera stream
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().then(() => {
            setVideoReady(true);
            console.log("✅ Camera ready and playing");
          });
        };
      } catch (err) {
        alert("Error accessing camera: " + err.message);
      }

      const ctx = wb.getContext("2d");
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      setCtxWhiteboard(ctx);

      // 🧩 Prevent scrolling when touching the canvas
      const preventTouchScroll = (e) => e.preventDefault();
      wb.addEventListener("touchstart", preventTouchScroll, { passive: false });
      wb.addEventListener("touchmove", preventTouchScroll, { passive: false });

      return () => {
        wb.removeEventListener("touchstart", preventTouchScroll);
        wb.removeEventListener("touchmove", preventTouchScroll);
      };
    };
    setup();
  }, []);

  // --- Helpers for mouse & touch coordinates ---
  const getPos = (e) => {
    const rect = whiteboardRef.current.getBoundingClientRect();
    let x, y;
    if (e.touches) {
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }
    return { x, y };
  };

  // --- Drawing logic (mouse + touch) ---
  const startDraw = (e) => {
    const { x, y } = getPos(e);
    ctxWhiteboard.beginPath();
    ctxWhiteboard.moveTo(x, y);
    setDrawing(true);
  };

  const draw = (e) => {
    if (!drawing) return;
    const { x, y } = getPos(e);
    ctxWhiteboard.lineTo(x, y);
    ctxWhiteboard.strokeStyle = color;
    ctxWhiteboard.lineWidth = lineWidth;
    ctxWhiteboard.stroke();
  };

  const endDraw = () => {
    setDrawing(false);
    ctxWhiteboard.closePath();
  };

  // --- Handle slides upload ---
  const handleSlides = (e) => {
    const files = Array.from(e.target.files);
    const imgs = files.map((f) => {
      const img = new Image();
      img.src = URL.createObjectURL(f);
      return img;
    });
    setSlides(imgs);
    setCurrentSlide(0);
  };

  // --- Manual navigation ---
  const nextSlide = () => {
    if (slides.length === 0) return;
    setCurrentSlide((s) => (s + 1) % slides.length);
  };
  const prevSlide = () => {
    if (slides.length === 0) return;
    setCurrentSlide((s) => (s - 1 + slides.length) % slides.length);
  };

  // --- Composite draw loop ---
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const video = videoRef.current;

    function drawFrame() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw slide
      if (slides.length > 0 && slides[currentSlide].complete) {
        ctx.drawImage(slides[currentSlide], 0, 0, canvas.width, canvas.height);
      }

// ✅ Draw camera as round PiP
if (videoReady && video && video.readyState >= 2) {
  const w = 180;
  const h = 180;
  const x = canvas.width - w - 30;
  const y = canvas.height - h - 30;

  ctx.save();
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(video, x, y, w, h);
  ctx.restore();
}

      // Draw whiteboard layer
      if (whiteboardRef.current) {
        ctx.drawImage(whiteboardRef.current, 0, 0);
      }

      requestAnimationFrame(drawFrame);
    }

    requestAnimationFrame(drawFrame);
  }, [slides, currentSlide, videoReady]);

  // --- Recording logic ---
  const startRecording = async () => {
    if (isRecording) return;

    try {
      const audio = await navigator.mediaDevices.getUserMedia({ audio: true });
      setAudioStream(audio);

      const canvasStream = canvasRef.current.captureStream(30);
      const combined = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audio.getAudioTracks(),
      ]);

      const mr = new MediaRecorder(combined, {
        mimeType: "video/webm; codecs=vp8,opus",
      });

      const localChunks = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) localChunks.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(localChunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `presentation_${Date.now()}.webm`;
        a.click();
      };

      mr.start();
      setChunks(localChunks);
      setMediaRecorder(mr);
      setIsRecording(true);
    } catch (err) {
      alert("Error starting recording: " + err.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      setIsRecording(false);
      if (audioStream) {
        audioStream.getTracks().forEach((t) => t.stop());
      }
    }
  };

  const clearWhiteboard = () => {
    if (ctxWhiteboard)
      ctxWhiteboard.clearRect(
        0,
        0,
        whiteboardRef.current.width,
        whiteboardRef.current.height
      );
  };

  return (
    <div className="flex flex-row items-start justify-center space-x-6 p-6 min-width:1760px"> {/* Left: Canvas Area */} <div className="relative border rounded-lg shadow-lg"> <canvas ref={canvasRef} className="border rounded-lg" /> <canvas ref={whiteboardRef} className="absolute top-0 left-0"       onMouseDown={startDraw}
    onTouchStart={startDraw}
    onTouchMove={draw}
    onTouchEnd={endDraw}
    onMouseMove={draw}
    onMouseUp={endDraw}
    onMouseLeave={endDraw} /> <video ref={videoRef} autoPlay muted playsInline style={{ position: "absolute", bottom: "0", right: "0", width: "160px", height: "120px", opacity: 0.0001, }} /> </div> {/* Right: Controls */} <div className="flex flex-col items-start space-y-4 w-64"> <h2 className="text-lg font-semibold text-gray-800 dark:text-white"> 📽️ Presenter Controls </h2> <div className="space-y-2"> <input type="file" accept="image/*" multiple onChange={handleSlides} /> <div className="flex space-x-2"> <button onClick={prevSlide} className="px-3 py-1 bg-gray-300 rounded"> ⬅️ Prev </button> <button onClick={nextSlide} className="px-3 py-1 bg-gray-300 rounded"> ➡️ Next </button> </div> {!isRecording ? ( <button onClick={startRecording} className="px-4 py-1 bg-green-600 dark:text-white text-gray-800 rounded w-full" > 🔴 Start Recording </button> ) : ( <button onClick={stopRecording} className="px-4 py-1 bg-red-600 dark:text-white text-gray-800 rounded w-full" > ⏹ Stop </button> )} </div> <div className="space-y-2"> <label className="block"> Color:{" "} <input type="color" value={color} onChange={(e) => setColor(e.target.value)} /> </label> <label className="block"> Line:{" "} <input type="range" min="1" max="10" value={lineWidth} onChange={(e) => setLineWidth(e.target.value)} /> </label> <button onClick={clearWhiteboard} className="px-2 py-1 bg-gray-200 rounded w-full"> 🧹 Clear Whiteboard </button> </div> </div> </div> );
}
