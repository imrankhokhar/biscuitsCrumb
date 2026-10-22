import type { ReactNode } from 'react'
import { Breadcrumb, type Crumb } from './Breadcrumb'

export function PageHeader({
  title,
  description,
  crumbs,
  actions,
}: {
  title: string
  description?: string
  crumbs?: Crumb[]
  actions?: ReactNode
}) {
  return (
    <header className="page-header page-header-hero">
      <div className="page-header-atmosphere" aria-hidden>
        <span className="page-header-orb page-header-orb-a" />
        <span className="page-header-orb page-header-orb-b" />
        <span className="page-header-grain" />
      </div>
      <div className="page-header-inner">
        {crumbs && crumbs.length > 0 && <Breadcrumb items={crumbs} />}
        <div className="page-header-row">
          <div className="page-header-copy">
            <h1>{title}</h1>
            {description ? <p className="page-desc">{description}</p> : null}
          </div>
          {actions ? <div className="page-header-actions">{actions}</div> : null}
        </div>
      </div>
    </header>
  )
}
