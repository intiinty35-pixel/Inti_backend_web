import { detectImageKind, isSupportedImage } from "./image-signature";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(16)]);

describe("detectImageKind", () => {
  it.each([
    ["JPEG", JPEG, "jpeg"],
    ["PNG", PNG, "png"],
    ["WEBP", WEBP, "webp"],
  ])("reconoce una imagen %s por su contenido", (_name, buffer, kind) => {
    expect(detectImageKind(buffer)).toBe(kind);
    expect(isSupportedImage(buffer)).toBe(true);
  });

  it("rechaza contenido que no es una imagen aunque se haga pasar por una", () => {
    expect(detectImageKind(Buffer.from("MZ ejecutable disfrazado de imagen"))).toBeNull();
    expect(detectImageKind(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
    expect(detectImageKind(Buffer.from("GIF89a" + "x".repeat(20)))).toBeNull();
    expect(detectImageKind(Buffer.alloc(0))).toBeNull();
  });

  it("rechaza un RIFF que no es WEBP", () => {
    const wave = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE"), Buffer.alloc(16)]);
    expect(isSupportedImage(wave)).toBe(false);
  });
});
