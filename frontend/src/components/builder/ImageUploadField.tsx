import { motion } from "framer-motion";
import { ImageIcon, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { uploadImage } from "../../api";

interface ImageUploadFieldProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
}

export function ImageUploadField({ label, value, onChange }: ImageUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      onChange(await uploadImage(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>{label}</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--gridline)",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {value ? (
            <img src={value} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <ImageIcon size={16} color="var(--text-muted)" />
          )}
        </div>
        <input
          type="text"
          value={value}
          placeholder="Paste an image URL…"
          onChange={(e) => onChange(e.target.value)}
          style={{
            flex: 1,
            background: "var(--surface-1)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "6px 8px",
            fontSize: 12,
          }}
        />
        <motion.button
          whileHover={{ scale: uploading ? 1 : 1.04 }}
          whileTap={{ scale: uploading ? 1 : 0.97 }}
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "6px 10px",
            fontSize: 12,
            color: "var(--text-secondary)",
            cursor: uploading ? "default" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          <Upload size={13} />
          {uploading ? "Uploading…" : "Upload"}
        </motion.button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
      </div>
      {error && <p style={{ fontSize: 11, color: "var(--series-red, #d64545)", marginTop: 4 }}>{error}</p>}
    </div>
  );
}
