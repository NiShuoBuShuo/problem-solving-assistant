export type Subject = 'math' | 'physics' | 'chemistry' | 'biology' | 'chinese' | 'english' | 'unknown'

export type CitationType = 'in_problem' | 'background'

export interface Citation {
  type: CitationType
  text: string
  source?: string
}

export interface StepContent {
  explanation: string
  key_point?: string
  details?: string
  formula?: string
  conclusion?: string
  diagram_svg?: string
  diagram_tikz?: string
  diagram_mermaid?: string
  diagram_caption?: string
  citations: Citation[]
}

export type StepType =
  | 'problem_type'
  | 'understanding'
  | 'known_conditions'
  | 'target'
  | 'approach'
  | 'derivation'
  | 'stage_conclusion'
  | 'final_answer'
  | 'verification'
  | 'summary'
  | 'alternative'
  | 'explanation'

export interface Step {
  step_index: number
  step_type: StepType
  title: string
  content: StepContent
  is_final: boolean
  method_index: number
  method_name?: string
}

export interface Session {
  session_id: string
  subject: Subject
  problem_type: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  referenced_step_index?: number
  new_step?: Step
}
