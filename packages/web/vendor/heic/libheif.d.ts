interface HeifImage {
  is_primary(): boolean;
  get_width(): number;
  get_height(): number;
  display(pixels: ImageData, callback: (pixels: ImageData | null) => void): void;
  free(): void;
}

interface HeifContext {
  readonly heifContext: unique symbol;
}

interface HeifDecoder {
  decoder: HeifContext | null;
  decode(bytes: Uint8Array): HeifImage[];
}

interface Libheif {
  HeifDecoder: new () => HeifDecoder;
  heif_context_free(context: HeifContext): void;
}

export default function createLibheif(): Promise<Libheif>;
