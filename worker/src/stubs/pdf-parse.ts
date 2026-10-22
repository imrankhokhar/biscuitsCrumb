export default async function pdfParse(): Promise<never> {
  throw new Error(
    'PDF statements are not supported on Cloudflare Workers. Upload Excel/CSV, or use POST /api/cashline/compare-json.',
  )
}
