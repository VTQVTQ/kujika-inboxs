import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import Pager from "@/components/Pager";
import { PagerSkeleton, SkeletonRows } from "@/components/Skeleton";
import { getCurrentUser } from "@/lib/auth";
import { listMyFeedback } from "@/lib/feedback";
import { fmtDateTime } from "@/lib/format";
import { keepTableParams, parseTableQuery } from "@/lib/table";
import { COLUMNS } from "./columns";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("feedback.meta"))("mine") };
}

type SP = Promise<Record<string, string | string[] | undefined>>;

const PATH = "/gop-y/cua-toi";

/** Góp ý của tôi — chỉ góp ý của chính người đang đăng nhập (lấy ở server), chỉ hiện ngày gửi + nội dung */
export default async function MyFeedbackPage({ searchParams }: { searchParams: SP }) {
  const [sp, user, t] = await Promise.all([searchParams, getCurrentUser(), getTranslations("feedback.mine")]);
  const table = parseTableQuery(sp, [] as readonly never[]);
  const keep = keepTableParams(table);

  // Không chờ ở đây: khung trang hiện ngay; thân bảng + phân trang chờ chung một lần truy vấn trong <Suspense>
  const data = listMyFeedback(user.account, table);
  // Gắn sẵn một nhánh xử lý để Node không coi là "unhandled rejection" khi await muộn; lỗi vẫn ném ở nơi await (error.tsx)
  data.catch(() => undefined);
  const dataKey = JSON.stringify([table.page, table.size]);

  /** Link giữ số dòng hiện tại, đổi các tham số trong patch (rỗng = bỏ) */
  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ ...keep, ...(table.page > 1 ? { page: String(table.page) } : {}), ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    const s = p.toString();
    return s ? `${PATH}?${s}` : PATH;
  };

  return (
    <>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col">{t("colSent")}</th>
              <th scope="col">{t("colContent")}</th>
            </tr>
          </thead>
          <Suspense key={dataKey} fallback={<SkeletonRows columns={COLUMNS} rows={Math.min(table.size, 10)} />}>
            <TableBody data={data} />
          </Suspense>
        </table>
      </div>
      <Suspense key={dataKey} fallback={<PagerSkeleton />}>
        <PagerData data={data} sizeHref={(size) => href({ page: "", size: size === 10 ? "" : String(size) })} pageHref={(page) => href({ page: page > 1 ? String(page) : "" })} />
      </Suspense>
    </>
  );
}

type MyFeedbackData = ReturnType<typeof listMyFeedback>;

async function TableBody({ data }: { data: MyFeedbackData }) {
  const [{ rows }, t, locale] = await Promise.all([data, getTranslations("feedback.mine"), getLocale()]);
  if (rows.length === 0) {
    return (
      <tbody>
        <tr>
          <td colSpan={COLUMNS.length} className="empty">
            <strong>{t("empty")}</strong>
          </td>
        </tr>
      </tbody>
    );
  }
  return (
    <tbody>
      {rows.map((r) => (
        <tr key={r.id}>
          <td className="nowrap">{fmtDateTime(r.createdAt.toISOString(), locale)}</td>
          {/* Chữ thuần (React tự escape), giữ xuống dòng */}
          <td><div className="feedback-content">{r.content}</div></td>
        </tr>
      ))}
    </tbody>
  );
}

async function PagerData({ data, sizeHref, pageHref }: { data: MyFeedbackData; sizeHref: (size: number) => string; pageHref: (page: number) => string }) {
  const { pageInfo } = await data;
  return <Pager info={pageInfo} sizeHref={sizeHref} pageHref={pageHref} />;
}
