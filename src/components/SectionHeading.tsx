import type { ReactNode } from 'react'
import Reveal from './Reveal'
import './SectionHeading.css'

type Props = {
  eyebrow: string
  title: ReactNode
  text?: string
  align?: 'start' | 'center'
}

export default function SectionHeading({ eyebrow, title, text, align = 'start' }: Props) {
  return (
    <Reveal className={`sec-head sec-head--${align}`}>
      <span className="eyebrow">
        <span className="eyebrow__dot" />
        {eyebrow}
      </span>
      <h2 className="sec-head__title">{title}</h2>
      {text ? <p className="sec-head__text">{text}</p> : null}
    </Reveal>
  )
}
