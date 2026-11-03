/** Hình dạng ô chờ của từng cột (cùng khai báo COLUMNS với bảng thật → đổi cột thì khung chờ tự khớp) */
type Shape = "text" | "textSub" | "codeSub" | "lines" | "pill" | "date" | "button" | "check";

const WIDTH: Record<Shape, string[]> = {
  check: ["1em"],
  text: ["70%"],
  textSub: ["60%", "40%"],
  codeSub: ["55%", "80%"],
  lines: ["85%", "50%"],
  pill: ["5.5em"],
  date: ["5.5em"],
  /* Cột Thao tác: 2 hàng nút (Xem + Mở ở hệ thống gốc / Trả lại + Xác nhận) */
  button: ["14em", "14em"],
};

export function SkeletonRows({ columns, rows }: { columns: readonly { id: string; sk: Shape; right?: boolean }[]; rows: number }) {
  return (
    <tbody aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i}>
          {columns.map((c) => (
            <td key={c.id} className={c.right ? "right" : undefined}>
              {WIDTH[c.sk].map((w, j) => (
                <span key={j} className="sk" style={{ width: w }} />
              ))}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

/** Khung chờ thanh phân trang: cùng lớp .pager (cùng chiều cao với thanh thật), bên trái số dòng, bên phải nhóm nút */
export function PagerSkeleton() {
  return (
    <div className="pager" aria-hidden="true">
      <span className="sk" style={{ width: "5em" }} />
      {/* Tối đa 60% để trên điện thoại không xuống hàng (thanh thật vẫn một hàng) */}
      <span className="sk" style={{ width: "22em", maxWidth: "60%" }} />
    </div>
  );
}
