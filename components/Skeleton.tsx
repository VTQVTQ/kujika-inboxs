/** Hình dạng ô chờ của từng cột (cùng khai báo COLUMNS với bảng thật → đổi cột thì khung chờ tự khớp) */
type Shape = "text" | "textSub" | "codeSub" | "lines" | "pill" | "date" | "button" | "check";

const WIDTH: Record<Shape, string[]> = {
  check: ["1em"],
  text: ["70%"],
  textSub: ["60%", "40%"],
  codeSub: ["55%", "80%"],
  lines: ["85%", "50%"],
  pill: ["3.5em"],
  date: ["5.5em"],
  button: ["4em"],
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
