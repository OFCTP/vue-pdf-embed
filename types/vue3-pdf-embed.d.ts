import { PDFDocumentProxy } from 'pdfjs-dist/types/display/api';
import { ComputedOptions, DefineComponent } from 'vue';

export interface VuePdfEmbedProps {
  disableAnnotationLayer?: boolean;
  disableTextLayer?: boolean;
  height?: number | string;
  imageResourcesPath?: string;
  page?: number;
  rotation?: number | string;
  source: object | string | Uint8Array;
  width?: number | string;
  margin?: number;
}

export interface VuePdfEmbedData {
  document: PDFDocumentProxy | null;
  pageCount: number | null;
  pageNums: number[];
}

export interface VuePdfEmbedMethods {
  print: (dpi?: number, filename?: string) => Promise<void>;
  render: () => Promise<void>;
}

declare const VuePdfEmbed: DefineComponent<
  VuePdfEmbedProps,
  {},
  VuePdfEmbedData,
  ComputedOptions,
  VuePdfEmbedMethods
>;

export default VuePdfEmbed;
