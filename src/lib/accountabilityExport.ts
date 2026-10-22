import ExcelJS from 'exceljs'
import { formatMoney } from './currency'
import type { AccountabilityItemRow, AccountabilitySummary, CurrencyOption } from '../types'

function stampFile() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function stampDisplay() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const COLORS = {
  title: 'FF0F3D2E',
  section: 'FF1A5C45',
  headerBg: 'FF1F6B52',
  headerFg: 'FFFFFFFF',
  metaLabel: 'FF5B6B62',
  zebra: 'FFF3F7F5',
  border: 'FFD5DDD8',
  accentBg: 'FFE8F5EF',
  profitPos: 'FF1A5C45',
  profitNeg: 'FFB45309',
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const edge: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: COLORS.border } }
  return { top: edge, left: edge, bottom: edge, right: edge }
}

export async function exportAccountabilityExcel(input: {
  summary: AccountabilitySummary
  items: AccountabilityItemRow[]
  currency: string
  currencies: CurrencyOption[]
  appName?: string
}) {
  const money = (n: number) => formatMoney(n, input.currency, input.currencies)
  const wb = new ExcelJS.Workbook()
  wb.creator = input.appName || 'Excelorithm'
  wb.created = new Date()

  const ws = wb.addWorksheet('Accountability', {
    views: [{ showGridLines: false }],
    properties: { defaultRowHeight: 18 },
  })

  ws.columns = [
    { key: 'a', width: 36 },
    { key: 'b', width: 14 },
    { key: 'c', width: 14 },
    { key: 'd', width: 14 },
    { key: 'e', width: 10 },
    { key: 'f', width: 14 },
    { key: 'g', width: 14 },
    { key: 'h', width: 14 },
  ]

  // Title
  ws.mergeCells('A1:H1')
  const title = ws.getCell('A1')
  title.value = 'Accountability report'
  title.font = { name: 'Calibri', size: 18, bold: true, color: { argb: COLORS.title } }
  title.alignment = { vertical: 'middle' }
  ws.getRow(1).height = 28

  // Meta
  ws.getCell('A2').value = 'Exported'
  ws.getCell('B2').value = stampDisplay()
  ws.getCell('A3').value = 'Currency'
  ws.getCell('B3').value = input.currency
  for (const cell of ['A2', 'A3']) {
    ws.getCell(cell).font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.metaLabel } }
  }
  for (const cell of ['B2', 'B3']) {
    ws.getCell(cell).font = { name: 'Calibri', size: 11 }
  }

  // Summary section
  ws.mergeCells('A5:B5')
  const summaryTitle = ws.getCell('A5')
  summaryTitle.value = 'Summary'
  summaryTitle.font = { name: 'Calibri', size: 13, bold: true, color: { argb: COLORS.section } }

  const summaryHeader = ws.getRow(6)
  summaryHeader.values = ['Metric', 'Amount']
  ;['A6', 'B6'].forEach((ref) => {
    const c = ws.getCell(ref)
    c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.headerFg } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } }
    c.border = thinBorder()
    c.alignment = { vertical: 'middle' }
  })

  const summaryRows: Array<[string, string | number]> = [
    ['Sales revenue', money(input.summary.totalRevenue)],
    ['Units sold', input.summary.unitsSold],
    ['Cost of goods', money(input.summary.totalCost)],
    ['Gross profit', money(input.summary.grossProfit)],
    ['Receivables', money(input.summary.receivables)],
    ['Collected', money(input.summary.totalCollected)],
    ['Stock at cost', money(input.summary.inventoryCostValue)],
    ['Stock at selling', money(input.summary.inventorySellValue)],
  ]

  summaryRows.forEach(([metric, amount], i) => {
    const rowNum = 7 + i
    const row = ws.getRow(rowNum)
    row.getCell(1).value = metric
    row.getCell(2).value = amount
    ;[1, 2].forEach((col) => {
      const c = row.getCell(col)
      c.font = { name: 'Calibri', size: 11 }
      c.border = thinBorder()
      c.alignment = { vertical: 'middle' }
      if (i % 2 === 1) {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebra } }
      }
    })
    if (metric === 'Gross profit') {
      row.getCell(1).font = { name: 'Calibri', size: 11, bold: true }
      row.getCell(2).font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.section } }
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.accentBg } }
      row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.accentBg } }
    }
  })

  // By item section
  const itemTitleRow = 16
  ws.mergeCells(`A${itemTitleRow}:H${itemTitleRow}`)
  const byItemTitle = ws.getCell(`A${itemTitleRow}`)
  byItemTitle.value = 'By item'
  byItemTitle.font = { name: 'Calibri', size: 13, bold: true, color: { argb: COLORS.section } }

  const itemHeaderRow = itemTitleRow + 1
  const headers = ['Item', 'Stock', 'Buy', 'Sell', 'Sold', 'Revenue', 'Cost', 'Profit']
  headers.forEach((label, i) => {
    const c = ws.getCell(itemHeaderRow, i + 1)
    c.value = label
    c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.headerFg } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } }
    c.border = thinBorder()
    c.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'right' }
  })
  ws.getRow(itemHeaderRow).height = 20

  input.items.forEach((item, i) => {
    const rowNum = itemHeaderRow + 1 + i
    const row = ws.getRow(rowNum)
    const values: Array<string | number> = [
      item.title,
      item.quantity,
      money(item.buyingPrice),
      money(item.sellingPrice),
      item.soldQty,
      money(item.revenue),
      money(item.cost),
      money(item.profit),
    ]
    values.forEach((value, colIdx) => {
      const c = row.getCell(colIdx + 1)
      c.value = value
      c.font = { name: 'Calibri', size: 11 }
      c.border = thinBorder()
      c.alignment = {
        vertical: 'middle',
        horizontal: colIdx === 0 ? 'left' : 'right',
      }
      if (i % 2 === 1) {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebra } }
      }
    })
    row.getCell(1).font = { name: 'Calibri', size: 11, bold: true }
    row.getCell(8).font = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: item.profit >= 0 ? COLORS.profitPos : COLORS.profitNeg },
    }
  })

  // Totals row for items
  if (input.items.length > 0) {
    const totalRowNum = itemHeaderRow + 1 + input.items.length
    const totalRow = ws.getRow(totalRowNum)
    const totalSold = input.items.reduce((s, r) => s + r.soldQty, 0)
    const totalRevenue = input.items.reduce((s, r) => s + r.revenue, 0)
    const totalCost = input.items.reduce((s, r) => s + r.cost, 0)
    const totalProfit = input.items.reduce((s, r) => s + r.profit, 0)
    const totalStock = input.items.reduce((s, r) => s + r.quantity, 0)
    const totals: Array<string | number> = [
      'Total',
      totalStock,
      '',
      '',
      totalSold,
      money(totalRevenue),
      money(totalCost),
      money(totalProfit),
    ]
    totals.forEach((value, colIdx) => {
      const c = totalRow.getCell(colIdx + 1)
      c.value = value
      c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.headerFg } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } }
      c.border = thinBorder()
      c.alignment = {
        vertical: 'middle',
        horizontal: colIdx === 0 ? 'left' : 'right',
      }
    })
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  downloadBlob(`accountability-${stampFile()}.xlsx`, blob)
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function exportAccountabilityPdf(input: {
  summary: AccountabilitySummary
  items: AccountabilityItemRow[]
  currency: string
  currencies: CurrencyOption[]
  appName?: string
}) {
  const money = (n: number) => formatMoney(n, input.currency, input.currencies)
  const title = input.appName ? `${escapeHtml(input.appName)} — Accountability` : 'Accountability'
  const rows = input.items
    .map(
      (row) => `
      <tr>
        <td>${escapeHtml(row.title)}</td>
        <td>${row.quantity}</td>
        <td>${escapeHtml(money(row.buyingPrice))}</td>
        <td>${escapeHtml(money(row.sellingPrice))}</td>
        <td>${row.soldQty}</td>
        <td>${escapeHtml(money(row.revenue))}</td>
        <td>${escapeHtml(money(row.cost))}</td>
        <td>${escapeHtml(money(row.profit))}</td>
      </tr>`,
    )
    .join('')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; color: #142019; margin: 28px; }
    h1 { margin: 0 0 4px; font-size: 22px; }
    .meta { color: #5b6b62; margin-bottom: 18px; font-size: 13px; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 22px; }
    .stat { border: 1px solid #d5ddd8; border-radius: 8px; padding: 10px 12px; }
    .stat span { display: block; color: #5b6b62; font-size: 12px; }
    .stat strong { font-size: 16px; }
    h2 { font-size: 16px; margin: 0 0 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #d5ddd8; padding: 7px 8px; text-align: left; }
    th { background: #eef3f0; }
    @media print {
      body { margin: 12px; }
      .hint { display: none; }
    }
  </style>
</head>
<body>
  <p class="hint">Use your browser print dialog → Save as PDF.</p>
  <h1>${title}</h1>
  <p class="meta">Exported ${stampDisplay()} · Currency ${escapeHtml(input.currency)}</p>
  <div class="stats">
    <div class="stat"><span>Sales revenue</span><strong>${escapeHtml(money(input.summary.totalRevenue))}</strong></div>
    <div class="stat"><span>Cost of goods</span><strong>${escapeHtml(money(input.summary.totalCost))}</strong></div>
    <div class="stat"><span>Gross profit</span><strong>${escapeHtml(money(input.summary.grossProfit))}</strong></div>
    <div class="stat"><span>Receivables</span><strong>${escapeHtml(money(input.summary.receivables))}</strong></div>
    <div class="stat"><span>Collected</span><strong>${escapeHtml(money(input.summary.totalCollected))}</strong></div>
    <div class="stat"><span>Units sold</span><strong>${input.summary.unitsSold}</strong></div>
    <div class="stat"><span>Stock at cost</span><strong>${escapeHtml(money(input.summary.inventoryCostValue))}</strong></div>
    <div class="stat"><span>Stock at selling</span><strong>${escapeHtml(money(input.summary.inventorySellValue))}</strong></div>
  </div>
  <h2>By item</h2>
  <table>
    <thead>
      <tr>
        <th>Item</th><th>Stock</th><th>Buy</th><th>Sell</th>
        <th>Sold</th><th>Revenue</th><th>Cost</th><th>Profit</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="8">No items</td></tr>'}</tbody>
  </table>
  <script>
    window.onload = function () {
      setTimeout(function () { window.print(); }, 250);
    };
  </script>
</body>
</html>`

  const win = window.open('', '_blank')
  if (!win) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    downloadBlob(`accountability-${stampFile()}.html`, blob)
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
}
