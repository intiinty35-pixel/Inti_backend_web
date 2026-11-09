import { BadRequestException } from "@nestjs/common";
import { complaintAttachmentMime, type ComplaintUpload } from "./complaints.service";

function upload(overrides: Partial<ComplaintUpload> = {}): ComplaintUpload {
  return {
    originalname: "respaldo.pdf",
    mimetype: "application/pdf",
    buffer: Buffer.from("%PDF-1.7"),
    size: 8,
    ...overrides,
  };
}

describe("complaintAttachmentMime", () => {
  it("accepts supported document formats with matching file signatures", () => {
    expect(complaintAttachmentMime(upload())).toBe("application/pdf");
    expect(complaintAttachmentMime(upload({
      originalname: "foto.png",
      mimetype: "image/png",
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    }))).toBe("image/png");
  });

  it("rejects extensions and declared MIME types that do not match the file signature", () => {
    expect(() => complaintAttachmentMime(upload({ originalname: "respaldo.jpg" }))).toThrow(BadRequestException);
    expect(() => complaintAttachmentMime(upload({ mimetype: "image/jpeg" }))).toThrow(BadRequestException);
  });

  it("rejects files larger than 5 MB", () => {
    expect(() => complaintAttachmentMime(upload({ size: 5 * 1024 * 1024 + 1 }))).toThrow(BadRequestException);
  });
});
