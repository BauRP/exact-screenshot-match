import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { Pause, Play, Trash2 } from "lucide-react";
import { loadAudioFile } from "@/lib/audio-files";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    audioNote: {
      insertAudioNote: (src: string) => ReturnType;
    };
  }
}

export const AudioNote = Node.create({
  name: "audioNote",
  group: "block",
  atom: true,
  draggable: false,
  selectable: true,
  isolating: true,

  addAttributes() {
    return {
      src: { default: "" as string },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-audio-note]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-audio-note": "true" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AudioNoteView);
  },

  addCommands() {
    return {
      insertAudioNote:
        (src: string) =>
        ({ chain }) =>
          chain()
            .insertContent([
              { type: this.name, attrs: { src } },
              { type: "paragraph" },
            ])
            .focus()
            .run(),
    };
  },
});

function AudioNoteView({ node, deleteNode, editor }: NodeViewProps) {
  const src = node.attrs.src as string;
  const [playbackSrc, setPlaybackSrc] = useState(() => src.startsWith("audiodb:") ? "" : src);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!src.startsWith("audiodb:")) {
      setPlaybackSrc(src);
      return;
    }
    let disposed = false;
    let objectUrl: string | null = null;
    setPlaybackSrc("");
    void loadAudioFile(src.slice("audiodb:".length)).then((blob) => {
      if (disposed || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setPlaybackSrc(objectUrl);
    }).catch((error) => console.error("Unable to load audio attachment", error));
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try {
        ctxRef.current?.close();
      } catch {}
    };
  }, []);

  const drawIdle = () => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    const { width, height } = cvs;
    ctx.clearRect(0, 0, width, height);
    const bars = 48;
    const barW = width / bars;
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (let i = 0; i < bars; i++) {
      const h = 4 + Math.abs(Math.sin(i * 0.6)) * (height * 0.4);
      ctx.fillRect(i * barW + 1, (height - h) / 2, barW - 2, h);
    }
  };

  useEffect(() => {
    drawIdle();
  }, []);

  const startVisualizer = () => {
    const audio = audioRef.current;
    const cvs = canvasRef.current;
    if (!audio || !cvs) return;

    if (!ctxRef.current) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctxRef.current = new AC();
      sourceRef.current = ctxRef.current.createMediaElementSource(audio);
      analyserRef.current = ctxRef.current.createAnalyser();
      analyserRef.current.fftSize = 128;
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(ctxRef.current.destination);
    }
    const analyser = analyserRef.current!;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const ctx2d = cvs.getContext("2d")!;

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const { width, height } = cvs;
      ctx2d.clearRect(0, 0, width, height);
      const bars = data.length;
      const barW = width / bars;
      for (let i = 0; i < bars; i++) {
        const v = data[i] / 255;
        const h = Math.max(3, v * height);
        const grad = ctx2d.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, "rgba(255,255,255,0.95)");
        grad.addColorStop(1, "rgba(255,255,255,0.35)");
        ctx2d.fillStyle = grad;
        ctx2d.fillRect(i * barW + 1, (height - h) / 2, barW - 2, h);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const stopVisualizer = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    drawIdle();
  };

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      try {
        await ctxRef.current?.resume();
      } catch {}
      await audio.play();
    }
  };

  const fmt = (s: number) => {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m}:${r.toString().padStart(2, "0")}`;
  };

  return (
    <NodeViewWrapper
      className="my-3"
      contentEditable={false}
      data-drag-handle={false}
    >
      <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/5 p-3 backdrop-blur">
        <button
          type="button"
          onClick={toggle}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-black hover:opacity-90"
          aria-label={playing ? "Пауза" : "Воспроизвести"}
        >
          {playing ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5 translate-x-0.5" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <canvas
            ref={canvasRef}
            width={320}
            height={40}
            className="h-10 w-full"
          />
          <div className="mt-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-white/60">
            <span>Аудио</span>
            <span>
              {fmt(progress)} / {fmt(duration)}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            audioRef.current?.pause();
            if (editor.isEditable) deleteNode();
          }}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
          aria-label="Удалить аудио"
        >
          <Trash2 className="h-4 w-4" />
        </button>

        <audio
          ref={audioRef}
          src={playbackSrc}
          preload="metadata"
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
          onPlay={() => {
            setPlaying(true);
            startVisualizer();
          }}
          onPause={() => {
            setPlaying(false);
            stopVisualizer();
          }}
          onEnded={() => {
            setPlaying(false);
            stopVisualizer();
          }}
        />
      </div>
    </NodeViewWrapper>
  );
}
