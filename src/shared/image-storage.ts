/** Carpeta raíz de todo lo que sube Inti; separa los archivos de cualquier otro uso de la cuenta de almacenamiento. */
export const IMAGE_ROOT = "inti";

export const IMAGE_FOLDERS = {
  properties: `${IMAGE_ROOT}/properties`,
  projects: `${IMAGE_ROOT}/projects`,
  paymentQr: `${IMAGE_ROOT}/payment-qr`,
} as const;

export type ImageFolder = (typeof IMAGE_FOLDERS)[keyof typeof IMAGE_FOLDERS];

export interface StoredImage {
  /** URL pública y permanente de la imagen. */
  url: string;
  /** Identificador para poder eliminarla después. */
  publicId: string;
}

/** Almacenamiento de imágenes en la nube. Es una clase abstracta para poder inyectarla y reemplazarla en las pruebas. */
export abstract class ImageStorage {
  /** Guarda la imagen y la describe, o devuelve null cuando el contenido no es JPG, PNG ni WEBP. */
  abstract save(buffer: Buffer, folder: ImageFolder): Promise<StoredImage | null>;

  /** Elimina las imágenes que ya no usa ningún registro; nunca falla por archivos inexistentes. */
  abstract remove(publicIds: string[]): Promise<void>;
}
