/** Lỗi trả ra API công khai: status HTTP + mã máy đọc được + câu giải thích (không chứa chi tiết nội bộ) */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: { path: string; message: string }[],
  ) {
    super(message);
  }
}
