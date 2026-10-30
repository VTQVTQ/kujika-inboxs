import Link from "next/link";

/** Đầu cột sắp xếp phía server: bấm đổi ?sort=&dir= (dir = chiều đang áp dụng, null = cột chưa được sắp) */
export default function SortTh({ href, dir, children }: { href: string; dir: "asc" | "desc" | null; children: React.ReactNode }) {
  return (
    <th scope="col" aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}>
      <Link href={href} className="sort-link" scroll={false}>
        {children}
        <span aria-hidden="true" className="sort-mark">{dir === "asc" ? "▲" : dir === "desc" ? "▼" : "↕"}</span>
      </Link>
    </th>
  );
}
