export type AssistantIntention = 'anomalies' | 'prevision' | 'rapport' | 'question_rh' | 'aide';

export interface AssistantActionRapide {
  libelle: string;
  intention: AssistantIntention;
}

export interface AssistantMessageRequest {
  message: string;
  id_service?: number;
}

export interface AssistantMessageResponse {
  intention: AssistantIntention;
  reponse: string;
  donnees: Record<string, unknown> | null;
  actions_suggerees: AssistantActionRapide[];
}

export interface AssistantCapaciteOut {
  intention: AssistantIntention;
  libelle: string;
  description: string;
  exemple: string;
}

/** Un message affiché dans le fil de discussion (créé côté frontend, pas persisté). */
export interface AssistantChatMessage {
  auteur: 'utilisateur' | 'assistant';
  texte: string;
  date: Date;
  actionsSuggerees?: AssistantActionRapide[];
  donnees?: Record<string, unknown> | null;
}
