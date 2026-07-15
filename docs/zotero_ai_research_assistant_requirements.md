# SRS-Vorbereitung: Zotero AI Research Assistant

**Projekt:** Zotero-Erweiterung mit KI-Integration für Paper-Analyse, Annotationen, Highlights, Tags und Notizen  
**Dokumenttyp:** Requirements-Elicitation-Ergebnis und IEEE-inspirierte SRS-Arbeitsgrundlage  
**Version:** 0.2  
**Datum:** 2026-07-15  
**Status:** Arbeitsfassung, aus Interview abgeleitet  
**Sprache:** Deutsch, formale Anforderungen in englischer „The system shall …“-Form  

---

## Änderungsverzeichnis

| Version | Datum | Änderung |
|---|---:|---|
| 0.1 | 2026-07-08 | Initiale Arbeitsfassung auf Basis des Requirements-Interviews |
| 0.2 | 2026-07-15 | Auto-Highlighting um getrennte Kategorie-Durchläufe, Positionsvalidierung und Reparatur fehlerhafter Fallback-Annotationen ergänzt |

---

## 1. Einleitung

### 1.1 Zweck des Dokuments

Dieses Dokument fasst die bisher erhobenen Anforderungen an eine Zotero-Erweiterung zusammen, die KI-gestützte Funktionen für wissenschaftliche Literaturarbeit bereitstellt. Es dient als Projektgrundlage für Konzeption, Architektur, Entwicklung, Testplanung und spätere Ausarbeitung einer vollständigen Software Requirements Specification (SRS).

Das Dokument ist IEEE-inspiriert strukturiert und enthält Vision, Systemgrenzen, Stakeholder, funktionale Anforderungen, Schnittstellenanforderungen, Datenanforderungen, nicht-funktionale Anforderungen, Annahmen, Einschränkungen, Geschäftsregeln und offene Punkte.

### 1.2 Produktname

**Zotero AI Research Assistant**  
Arbeitsname; endgültiger Produktname ist offen.

### 1.3 Zielgruppe des Dokuments

- Produktverantwortliche
- Plugin-Entwickler
- Architekturverantwortliche
- Tester
- spätere Contributor
- Forschende als fachliche Reviewer

### 1.4 Begriffe und Abkürzungen

| Begriff | Bedeutung |
|---|---|
| Zotero | Literaturverwaltungssoftware und Zielplattform der Erweiterung |
| Paper | In Zotero gespeichertes wissenschaftliches Dokument, typischerweise PDF |
| Annotation | Zotero-Anmerkung, Markierung oder Kommentar im PDF |
| Highlight | Farbige Markierung einer Textstelle in einem PDF |
| Note | Zotero-Notiz |
| Tag | Zotero-Tag an einem Eintrag |
| KI / AI | Künstliche Intelligenz, insbesondere LLM-basierte Textanalyse |
| LLM | Large Language Model |
| RAG | Retrieval-Augmented Generation |
| Embedding | Vektorrepräsentation eines Textes für semantische Suche |
| Lokaler Index | Lokal gespeicherter Such- und Retrieval-Datenbestand |
| MVP | Minimum Viable Product |

---

## 2. System Vision and Problem Definition

### 2.1 Problem Statement

Promovierende und Forschende investieren in Zotero viel manuelle Arbeit in das Lesen, Markieren und Annotieren wissenschaftlicher Paper. Diese Informationen verlieren später häufig ihren Nutzen, weil sie schwer auffindbar, nicht semantisch strukturiert und nur eingeschränkt für spätere wissenschaftliche Schreib- und Analyseprozesse wiederverwendbar sind.

Das System soll insbesondere folgendes Problem lösen: Markierungen und Annotationen gehen im späteren Arbeitsprozess unter. Nutzer erhalten nach manueller Arbeit nicht genug Überblick darüber, was sie wo markiert haben und wie diese Inhalte beim Schreiben von Papers, Reviews oder Dissertationen wiederverwendet werden können.

### 2.2 Product Vision

Die Zotero-Erweiterung soll ein Zotero-internes, nutzergesteuertes KI-Lesewerkzeug für Promovierende und Forschende sein. Sie soll vorhandene Zotero-PDFs, Annotationen, Markierungen, Notizen, Tags und Kollektionen analysieren, semantisch strukturieren und für spätere wissenschaftliche Arbeit nutzbar machen.

Der Fokus liegt auf besserem Lesen, Verstehen, Wiederfinden und Strukturieren von Paper-Inhalten. Die spätere Schreibunterstützung ist ein nachgelagerter Nutzen.

### 2.3 Primäre Nutzer

Primäre Nutzer sind Promovierende und Forschende, die Zotero als Einzelpersonen für ihre wissenschaftliche Literaturarbeit nutzen.

### 2.4 Zentrale Erfolgsziele

| Ziel-ID | Ziel |
|---|---|
| GOAL-001 | Bessere Auffindbarkeit von Markierungen und Annotationen |
| GOAL-002 | Automatische Generierung und Wiederverwertung von Notizen |
| GOAL-003 | Automatisches Erstellen semantisch passender farblicher Highlights |
| GOAL-004 | Strukturierte Paper-Zusammenfassungen nach wissenschaftlichen Kategorien |
| GOAL-005 | Vorbereitung späterer wissenschaftlicher Schreibprozesse |
| GOAL-006 | Token-effiziente Analyse großer PDFs durch lokales Retrieval |
| GOAL-007 | Offline-Nutzbarkeit lokaler Funktionen |

---

## 3. System Scope

### 3.1 In Scope für MVP

| Scope-ID | Bestandteil |
|---|---|
| SCOPE-IN-001 | Zotero-interne Erweiterung |
| SCOPE-IN-002 | Verarbeitung bereits vorhandener Zotero-Dokumente und PDFs |
| SCOPE-IN-003 | Verarbeitung vorhandener Zotero-Annotationen, Markierungen, Notizen und Tags |
| SCOPE-IN-004 | Analyse eines oder mehrerer manuell ausgewählter Zotero-Paper |
| SCOPE-IN-005 | KI-Konfiguration |
| SCOPE-IN-006 | Farb-Bedeutungs-Konfiguration |
| SCOPE-IN-007 | Automatisches Erstellen farblicher Highlights im PDF |
| SCOPE-IN-008 | Generierung von Zotero-Notizen aus vorhandenen Annotationen und Markierungen |
| SCOPE-IN-009 | Zusammenfassung vorhandener Notizen und Annotationen |
| SCOPE-IN-010 | Nutzung und Erstellung von Zotero-Tags |
| SCOPE-IN-011 | Ergebnisansicht |
| SCOPE-IN-012 | Speichern generierter Ergebnisse als Zotero-Notizen |
| SCOPE-IN-013 | Freie Prompts |
| SCOPE-IN-014 | Vorbereitete Prompt-Vorlagen |
| SCOPE-IN-015 | Lokaler RAG-/Indexmechanismus |
| SCOPE-IN-016 | Automatische lokale Indexaktualisierung |
| SCOPE-IN-017 | Offline-Nutzung lokaler Funktionen |
| SCOPE-IN-018 | Unterstützung mehrerer KI-Anbieter |

### 3.2 Post-MVP / Future Scope

| Scope-ID | Bestandteil |
|---|---|
| FUT-001 | Kollektionszusammenfassungen |
| FUT-002 | Vergleichende Analyse mehrerer Paper innerhalb einer Kollektion |
| FUT-003 | Eigenständige semantische Suche über Paper, Highlights, Annotationen, Notizen, Tags und Kollektionen |
| FUT-004 | Obsidian-Integration |
| FUT-005 | Word-, LaTeX- oder Markdown-Editor-Integration |
| FUT-006 | Erweiterte Review-Workflows für systematische Reviews |

### 3.3 Out of Scope für Version 1

| Scope-ID | Ausschluss |
|---|---|
| SCOPE-OUT-001 | Externe Paper-Suche |
| SCOPE-OUT-002 | Automatischer Paper-Import |
| SCOPE-OUT-003 | Web-Crawling wissenschaftlicher Quellen |
| SCOPE-OUT-004 | Automatische externe KI-Analyse ohne Nutzerstart |
| SCOPE-OUT-005 | Direkte Integration in Obsidian, Word, LaTeX oder Markdown-Editoren |
| SCOPE-OUT-006 | Allgemeine Organisation der Zotero-Bibliothek |
| SCOPE-OUT-007 | Automatisches Verschieben von Papers zwischen Kollektionen |
| SCOPE-OUT-008 | Ersatz der nativen Zotero-Literaturverwaltung |

---

## 4. Stakeholder

### 4.1 Stakeholder Register

| Stakeholder-ID | Rolle | Relevanz | Hauptinteresse | Status |
|---|---|---:|---|---|
| STK-001 | Einzelne Forschende / Promovierende | sehr hoch | Bessere Auffindbarkeit und Wiederverwendung von Annotationen | bestätigt |
| STK-002 | Zotero-Power-User | hoch | Skalierbare Analyse großer Libraries | [ASSUMPTION] |
| STK-003 | Literaturreview-Autor | hoch | Kollektionsübersicht und Paper-Vergleich | [ASSUMPTION] |
| STK-004 | Systematic-Review-Nutzer | mittel | Strukturierte, vergleichbare Extraktion | [ASSUMPTION] |
| STK-005 | Plugin-Entwickler | sehr hoch | Umsetzbare Architektur und klare Anforderungen | [ASSUMPTION] |
| STK-006 | Zotero-Plattform / Zotero-API | hoch | Kompatibilität mit Zotero-Datenmodell | [ASSUMPTION] |
| STK-007 | KI-Anbieter | mittel | Modell- und API-Nutzung | [ASSUMPTION] |
| STK-008 | Lokale Modelle | mittel | Offline- und Datenschutz-Workflows | [ASSUMPTION] |
| STK-009 | Datenschutzperspektive | hoch | Lokale Datenhaltung, kontrollierte Datenübertragung | [ASSUMPTION] |
| STK-010 | Wissenschaftliche Qualitätsperspektive | hoch | Nützliche, strukturierte, wissenschaftlich brauchbare Outputs | [ASSUMPTION] |
| STK-011 | Community-Nutzer | mittel | Installation, Stabilität, Feedback | [ASSUMPTION] |

---

## 5. Product Perspective

### 5.1 Systemkontext

Das System ist eine Erweiterung innerhalb von Zotero. Es nutzt Zotero-Dokumente, PDFs, Annotationen, Markierungen, Notizen, Tags, Metadaten und Sammlungszuordnungen als Eingaben. Die Erweiterung stellt KI-gestützte Workflows bereit, die vom Nutzer explizit gestartet werden.

### 5.2 Kontextabgrenzung

| Kontextobjekt | Beziehung zum System |
|---|---|
| Zotero Desktop | Host-Anwendung |
| Zotero PDF Reader | Quelle und Ziel für Highlights und Annotationen |
| Zotero Notes | Quelle und Ziel für Notizen |
| Zotero Tags | Quelle und Ziel für Tags |
| Zotero Metadata | Quelle für bibliografische Kontextinformationen |
| Externe KI-Anbieter | Optionaler Verarbeitungsdienst |
| Lokale Modelle | Optionaler lokaler Verarbeitungsdienst |
| Lokaler Index | Interner, abgeleiteter Datenbestand |
| Nutzergerät | Speicherort für lokale Daten, Embeddings und Index |

---

## 6. Product Functions

### 6.1 MVP-Funktionsgruppen

| Funktionsgruppe | Beschreibung |
|---|---|
| FG-001 | KI-Anbieter konfigurieren |
| FG-002 | Farb-Bedeutungen konfigurieren |
| FG-003 | Einzelne oder mehrere ausgewählte Paper analysieren |
| FG-004 | PDF automatisch farblich markieren |
| FG-005 | Zotero-Notizen aus Markierungen und Annotationen erzeugen |
| FG-006 | Vorhandene Notizen und Annotationen zusammenfassen |
| FG-007 | Tags analysieren, vorschlagen und anlegen |
| FG-010 | Lokalen Index/RAG-Datenbestand aufbauen und aktualisieren |
| FG-011 | Freie Prompts und Prompt-Vorlagen ausführen |
| FG-012 | Ergebnisse anzeigen und als Zotero-Notiz speichern |

### 6.2 Nicht-MVP, aber Produktvision

| Funktionsgruppe | Beschreibung |
|---|---|
| FG-008 | Kollektion zusammenfassen |
| FG-009 | Paper innerhalb einer Kollektion vergleichen |

---

## 7. Functional Requirements

### 7.1 KI-Konfiguration

| ID | Granularität | Anforderung |
|---|---:|---|
| FR-001 | High | The system shall allow users to configure AI providers for Zotero-based AI workflows. |
| FR-013 | Medium | The system shall provide configuration controls for OpenAI-compatible endpoints. |
| FR-014 | Medium | The system shall provide configuration controls for Codex-based integration where technically feasible. |
| FR-015 | Medium | The system shall provide configuration controls for GitHub Copilot integration where technically feasible. |
| FR-016 | Medium | The system shall provide configuration controls for locally hosted AI models. |
| FR-017 | Detailed | The system shall allow the user to enter and store an endpoint URL for OpenAI-compatible providers. |
| FR-018 | Detailed | The system shall allow the user to enter and store model identifiers for configured AI providers. |
| FR-019 | Detailed | The system shall allow the user to configure authentication credentials for API-based providers. |
| FR-020 | Detailed | The system shall validate AI provider configuration before executing a workflow using that provider. |
| FR-021 | Detailed | The system shall allow the user to select the active AI provider for a workflow. |
| FR-022 | Detailed | The system shall clearly handle unavailable external AI providers when the system is offline. |

### 7.2 Farb-Bedeutungs-Konfiguration

| ID | Granularität | Anforderung |
|---|---:|---|
| FR-002 | High | The system shall allow users to configure semantic meanings for Zotero annotation colors. |
| FR-023 | Medium | The system shall provide default scholarly categories for color semantics configuration. |
| FR-024 | Medium | The system shall include methodology, results, literature, limitations, research question, data, and open points as default categories. |
| FR-025 | Medium | The system shall allow users to modify, remove, or extend default scholarly categories. |
| FR-026 | Detailed | The system shall detect the set of standard annotation colors available in the installed Zotero version. |
| FR-027 | Detailed | The system shall provide a configurable semantic category mapping for each detected standard Zotero annotation color. |
| FR-028 | Detailed | The system shall allow each Zotero annotation color to be mapped to one or more semantic categories. |
| FR-029 | Detailed | The system shall allow users to define custom category labels for Zotero annotation colors. |
| FR-030 | Detailed | The system shall preserve user-defined color-to-category mappings across Zotero sessions. |
| FR-031 | Detailed | The system shall provide a reset option for restoring the default color-category configuration. |

### 7.3 Paper-Analyse

| ID | Granularität | Anforderung |
|---|---:|---|
| FR-003 | High | The system shall analyze selected Zotero papers using PDF content, annotations, highlights, notes, tags, and metadata. |
| FR-032 | Medium | The system shall support full-PDF analysis for selected Zotero items. |
| FR-033 | Medium | The system shall allow users to select one or more Zotero papers for analysis without requiring full collection analysis. |
| FR-034 | Medium | The system shall combine full-PDF content with available Zotero annotations, highlights, notes, tags, metadata, and configured color semantics when generating paper-level outputs. |
| FR-035 | Detailed | The system shall allow a user to start an analysis workflow from a selected Zotero item. |
| FR-036 | Detailed | The system shall allow a user to start an analysis workflow from multiple selected Zotero items. |
| FR-037 | Detailed | The system shall generate a structured summary for each analyzed paper. |
| FR-038 | Detailed | The system shall group paper summaries by configured scholarly categories where applicable. |
| FR-039 | Detailed | The system shall include methodology, results, literature, limitations, research question, data, and open points in generated category-based summaries when evidence is available. |
| FR-040 | Detailed | The system shall indicate when a configured category has no relevant evidence in the analyzed paper. |

### 7.4 Automatische Highlight-Erstellung

| ID | Granularität | Anforderung |
|---|---:|---|
| FR-004 | High | The system shall automatically create colored highlights in Zotero PDFs after user initiation. |
| FR-041 | Medium | The system shall use configured color-to-category mappings when deciding which paper passages to highlight. |
| FR-042 | Medium | The system shall support AI-generated highlights for methodology, results, literature, limitations, research questions, data, and open points. |
| FR-043 | Detailed | The system shall identify relevant text passages in a selected PDF for configured scholarly categories. |
| FR-044 | Detailed | The system shall create a Zotero highlight for each selected passage using the color mapped to the relevant category. |
| FR-045 | Detailed | The system shall select the most relevant configured color when automatically creating a highlight for a paper passage. |
| FR-046 | Detailed | The system shall avoid creating duplicate highlights for the same text span when an equivalent highlight already exists. |
| FR-047 | Detailed | The system shall not require per-highlight confirmation after the user starts the automatic highlighting workflow. |
| FR-048 | Detailed | The system shall treat AI-generated highlights as regular Zotero highlights after creation. |
| FR-102 | Detailed | The system shall process each configured highlight category in a separate AI pass before merging and deduplicating the suggested passages. |
| FR-103 | Detailed | The system shall detect plugin-created highlight fallbacks with invalid or missing text geometry and retry them as positioned highlights when usable PDF reader geometry becomes available. |
| FR-104 | Detailed | The system shall remove a broken fallback annotation only after its replacement highlight has been saved successfully. |
| FR-105 | Detailed | The system shall preserve a fallback annotation when repair geometry is unavailable or replacement creation fails. |
| FR-106 | Detailed | The system shall cover the complete PDF during auto-highlighting: send it whole when it fits the effective context budget, otherwise process exhaustive page-labelled windows with at least 500 characters of overlap at every boundary. |
| FR-107 | Detailed | The system shall not report auto-highlight text chunking as a missing-index or background-indexing condition. |
| FR-108 | Detailed | The system shall use the lower of provider-reported model context capacity and the user-configured auto-highlight context cap, defaulting the user cap to 65,536 tokens when provider metadata is absent. |
| FR-109 | Detailed | The system shall subtract category-specific prompt overhead, completion and reasoning reserves, and a token-estimation safety margin before allocating PDF text, and shall set the provider completion limit to the reserved output size. |
| FR-110 | Detailed | For oversized indexed PDFs, category-specific local retrieval may prioritize matching PDF windows but shall not omit or duplicate any window; unavailable indexing or retrieval failure shall fall back to exhaustive document order. |
| FR-111 | Detailed | The system shall parse common provider model context fields including `context_length`, `max_context_length`, `max_model_len`, and `context_window` without breaking providers that only implement model listing. |
| FR-112 | Detailed | When a provider explicitly rejects a window for exceeding context size, the system shall split only that failed window with overlap and retry; other provider failures shall not trigger splitting. |

### 7.5 Notizgenerierung und Notizzusammenfassung

| ID | Granularität | Anforderung |
|---|---:|---|
| FR-005 | High | The system shall generate Zotero notes from existing Zotero annotations and highlights. |
| FR-006 | High | The system shall summarize existing Zotero notes and annotations. |
| FR-049 | Medium | The system shall provide a note generation module for creating Zotero notes from existing annotations and highlights. |
| FR-050 | Medium | The system shall provide a note summarization module for summarizing existing Zotero notes and annotations. |
| FR-051 | Detailed | The system shall generate a Zotero note containing a structured summary of selected paper annotations. |
| FR-052 | Detailed | The system shall generate a Zotero note containing a structured summary of selected paper highlights. |
| FR-053 | Detailed | The system shall group note content by configured color-category mappings where applicable. |
| FR-054 | Detailed | The system shall allow generated note output to be displayed before or after saving. |
| FR-055 | Detailed | The system shall save generated paper-level results as Zotero notes associated with the analyzed paper. |
| FR-056 | Detailed | The system shall treat AI-generated Zotero notes as regular Zotero notes after creation. |

### 7.6 Tag-Funktionen

| ID | Granularität | Anforderung |
|---|---:|---|
| FR-007 | High | The system shall analyze, suggest, and create Zotero tags for selected papers. |
| FR-057 | Medium | The system shall analyze existing Zotero tags as input for AI-assisted paper understanding. |
| FR-058 | Medium | The system shall suggest Zotero tags for papers based on paper content, annotations, highlights, notes, metadata, and configured categories. |
| FR-059 | Medium | The system shall create new Zotero tags after the user explicitly starts the corresponding workflow. |
| FR-060 | Detailed | The system shall identify existing tags attached to each selected Zotero item. |
| FR-061 | Detailed | The system shall propose additional tags based on AI analysis. |
| FR-062 | Detailed | The system shall write generated tags directly to the selected Zotero item after the user starts the tag workflow. |
| FR-063 | Detailed | The system shall not require per-tag confirmation after workflow start. |
| FR-064 | Detailed | The system shall avoid adding duplicate tags to a Zotero item. |

### 7.7 Lokaler Index und RAG

| ID | Granularität | Anforderung |
|---|---:|---|
| FR-008 | High | The system shall build and update a local retrieval index for Zotero paper analysis workflows. |
| FR-065 | Medium | The system shall support token-efficient processing of large PDFs and large sets of selected papers. |
| FR-066 | Medium | The system shall provide a retrieval-augmented analysis mechanism for selecting relevant document passages before sending content to an AI provider. |
| FR-067 | Medium | The system shall index PDF text, annotations, notes, tags, metadata, and color-category mappings for later retrieval. |
| FR-068 | Medium | The system shall support semantic retrieval over indexed Zotero content. |
| FR-069 | Medium | The system shall support keyword-based retrieval over indexed Zotero content. |
| FR-070 | Medium | The system shall support hybrid retrieval that combines semantic and keyword-based search. |
| FR-071 | Medium | The system shall support reranking or relevance refinement before sending retrieved content to the selected AI provider. |
| FR-072 | Detailed | The system shall store generated embeddings locally on the user’s device. |
| FR-073 | Detailed | The system shall store retrieval indexes locally on the user’s device. |
| FR-074 | Detailed | The system shall not require a cloud-hosted vector database for paper-level retrieval in the MVP. |
| FR-075 | Detailed | The system shall automatically update the local retrieval index when relevant Zotero content changes are detected. |
| FR-076 | Detailed | The system shall distinguish local background indexing from background AI analysis. |
| FR-077 | Detailed | The system shall not send content to an external AI provider during automatic local index updates unless the user explicitly starts an AI workflow. |
| FR-078 | Detailed | The system shall allow the local index to be rebuilt when synchronization state becomes inconsistent or outdated. |
| FR-079 | Detailed | The system shall treat the local retrieval index as a derived cache that can be rebuilt from Zotero library content. |

### 7.8 Prompt-Vorlagen und freie Prompts

| ID | Granularität | Anforderung |
|---|---:|---|
| FR-009 | High | The system shall execute predefined prompt templates and free-form user prompts. |
| FR-080 | Medium | The system shall provide predefined prompt templates for common scholarly analysis workflows. |
| FR-081 | Medium | The system shall provide a free-form prompt input for custom user-defined analysis requests. |
| FR-082 | Detailed | The system shall provide a predefined prompt template for methodology extraction. |
| FR-083 | Detailed | The system shall provide a predefined prompt template for results summarization. |
| FR-084 | Detailed | The system shall provide a predefined prompt template for literature or related work context. |
| FR-085 | Detailed | The system shall provide a predefined prompt template for limitations extraction. |
| FR-086 | Detailed | The system shall provide a predefined prompt template for research question extraction. |
| FR-087 | Detailed | The system shall provide a predefined prompt template for data description extraction. |
| FR-088 | Detailed | The system shall provide a predefined prompt template for identifying problems and open points. |
| FR-089 | Detailed | The system shall allow the user to enter a free-form prompt for selected Zotero papers. |
| FR-090 | Detailed | The system shall execute a free-form prompt using selected paper content and retrieved context. |

### 7.9 Ergebnisansicht und Speichern

| ID | Granularität | Anforderung |
|---|---:|---|
| FR-010 | High | The system shall display generated results and allow users to save them as Zotero notes. |
| FR-091 | Medium | The system shall display generated analysis results in a result view. |
| FR-092 | Medium | The system shall allow generated analysis results to be saved as Zotero notes. |
| FR-093 | Medium | The system shall support workflows where generated results are both displayed in the plugin result view and persisted as Zotero notes. |
| FR-094 | Detailed | The system shall display workflow progress while analyzing selected papers. |
| FR-095 | Detailed | The system shall display generated category-based summaries in the result view. |
| FR-096 | Detailed | The system shall display generated notes before or after saving. |
| FR-097 | Detailed | The system shall allow the user to save a generated paper-level result as a Zotero note associated with the analyzed paper. |
| FR-098 | Detailed | The system shall allow users to continue working with generated results inside Zotero after workflow completion. |

### 7.10 Post-MVP: Kollektionsanalyse

| ID | Granularität | Anforderung |
|---|---:|---|
| FR-099 | Future | The system should generate an overall summary for a selected Zotero collection in a later release. |
| FR-100 | Future | The system should generate comparative overviews across papers within a selected Zotero collection in a later release. |
| FR-101 | Future | The system should compare papers by configured scholarly categories such as methodology, results, literature, limitations, research questions, data, and open points in a later release. |

---

## 8. External Interface Requirements

### 8.1 Zotero-Schnittstelle

| ID | Granularität | Anforderung |
|---|---:|---|
| EIR-001 | High | The system shall integrate with Zotero as a desktop extension. |
| EIR-002 | Medium | The system shall read Zotero items, PDFs, annotations, highlights, notes, tags, metadata, and collection membership where supported by Zotero APIs. |
| EIR-003 | Medium | The system shall write generated highlights, tags, and notes to Zotero after user-initiated workflows. |
| EIR-004 | Detailed | The system shall associate generated paper-level notes with the corresponding Zotero item. |
| EIR-005 | Detailed | The system shall create Zotero-compatible annotations for AI-generated highlights. |
| EIR-006 | Detailed | The system shall avoid modifying Zotero library organization such as collection membership or item location in the MVP. |

### 8.2 KI-Provider-Schnittstellen

| ID | Granularität | Anforderung |
|---|---:|---|
| EIR-007 | High | The system shall support multiple AI provider types. |
| EIR-008 | Medium | The system shall support OpenAI-compatible API endpoints. |
| EIR-009 | Medium | The system shall support Codex integration where technically feasible. |
| EIR-010 | Medium | The system shall support GitHub Copilot integration where technically feasible. |
| EIR-011 | Medium | The system shall support locally hosted AI models. |
| EIR-012 | Detailed | The system shall encapsulate provider-specific request and response handling behind a provider abstraction. |
| EIR-013 | Detailed | The system shall allow provider configuration without code changes. |
| EIR-014 | Detailed | The system shall handle provider errors and display understandable messages to the user. |

### 8.3 Lokale Index-/Retrieval-Schnittstelle

| ID | Granularität | Anforderung |
|---|---:|---|
| EIR-015 | Medium | The system shall support a replaceable local retrieval backend. |
| EIR-016 | Medium | The system shall support the use of a local embedded retrieval library or vector database. |
| EIR-017 | Detailed | The system shall isolate retrieval backend operations from AI generation workflow logic. |
| EIR-018 | Detailed | The system shall allow the retrieval backend to be rebuilt from Zotero source data. |

---

## 9. Data Requirements

### 9.1 Eingabedaten

| Datenobjekt | Quelle | Nutzung |
|---|---|---|
| PDF-Text | Zotero PDF | Paper-Analyse, Highlight-Erstellung, RAG |
| Annotationen | Zotero | Notizgenerierung, Zusammenfassung |
| Highlights | Zotero | Notizgenerierung, Farbsemantik |
| Notizen | Zotero | Zusammenfassung, Kontext |
| Tags | Zotero | Analyse, Vorschläge, Kontext |
| Metadaten | Zotero | Kontext, Ergebnisstruktur |
| Farbkonfiguration | Plugin-Konfiguration | semantische Kategorisierung |
| Prompts | Nutzer / Vorlagen | KI-Workflows |
| Embeddings | lokaler Index | Retrieval |
| Indexdaten | lokaler Index | RAG, effiziente Analyse |

### 9.2 Datenanforderungen

| ID | Granularität | Anforderung |
|---|---:|---|
| DAR-001 | High | The system shall use Zotero library content as the primary source of analysis data. |
| DAR-002 | Medium | The system shall store user configuration locally. |
| DAR-003 | Medium | The system shall store embeddings and retrieval index data locally. |
| DAR-004 | Detailed | The system shall not require cloud storage for embeddings or retrieval index data. |
| DAR-005 | Detailed | The system shall be able to rebuild local index data from Zotero library content. |
| DAR-006 | Detailed | The system shall persist user-defined color-category mappings. |
| DAR-007 | Detailed | The system shall persist configured AI provider settings. |
| DAR-008 | Detailed | The system shall protect stored API credentials using an appropriate secure storage mechanism where available. |
| DAR-009 | Detailed | The system shall avoid storing unnecessary copies of full PDF content outside the local index cache. |
| DAR-010 | Detailed | The system shall preserve links between generated outputs and their originating Zotero item where applicable. |

---

## 10. Non-functional Requirements

### 10.1 Performance

| ID | Granularität | Anforderung |
|---|---:|---|
| NFR-001 | High | The system shall support efficient analysis of large PDFs and multiple selected papers. |
| NFR-002 | Medium | The system shall use local retrieval to reduce unnecessary token usage. |
| NFR-003 | Medium | The system shall provide progress feedback for long-running workflows. |
| NFR-004 | Detailed | The system shall avoid sending entire large document sets to an AI provider when retrieved context is sufficient. |
| NFR-005 | Detailed | The system shall perform automatic local index updates without noticeably blocking normal Zotero usage. |
| NFR-006 | Detailed | The system shall allow long-running workflows to report their current status in the user interface. |

### 10.2 Security and Privacy

| ID | Granularität | Anforderung |
|---|---:|---|
| NFR-007 | High | The system shall protect user research data by keeping local indexes and embeddings on the user’s device. |
| NFR-008 | Medium | The system shall not transmit data to external AI providers during local background index updates. |
| NFR-009 | Medium | The system shall require explicit user initiation before content is sent to an external AI provider. |
| NFR-010 | Detailed | The system shall not transmit local embeddings or local index files to external AI providers. |
| NFR-011 | Detailed | The system shall store API credentials securely where platform capabilities allow. |
| NFR-012 | Detailed | The system shall avoid exposing API secrets in logs, error messages, or result views. |

### 10.3 Usability

| ID | Granularität | Anforderung |
|---|---:|---|
| NFR-013 | High | The system shall be usable by researchers without requiring knowledge of embeddings, RAG, or model internals. |
| NFR-014 | Medium | The system shall provide predefined workflows for common scholarly tasks. |
| NFR-015 | Medium | The system shall provide free-form prompt input for advanced users. |
| NFR-016 | Detailed | The system shall allow users to configure color meanings through the user interface. |
| NFR-017 | Detailed | The system shall not require per-item confirmation for generated tags, highlights, or notes after workflow start. |
| NFR-018 | Detailed | The system shall display generated results in a readable structured form. |

### 10.4 Reliability

| ID | Granularität | Anforderung |
|---|---:|---|
| NFR-019 | High | The system shall preserve Zotero data integrity when creating generated notes, tags, and highlights. |
| NFR-020 | Medium | The system shall avoid duplicate generated tags and duplicate equivalent highlights. |
| NFR-021 | Medium | The system shall allow the local index to be rebuilt when inconsistent. |
| NFR-022 | Detailed | The system shall not modify Zotero collection membership in the MVP. |
| NFR-023 | Detailed | The system shall handle failed AI workflows without corrupting Zotero notes, tags, annotations, or index data. |

### 10.5 Maintainability

| ID | Granularität | Anforderung |
|---|---:|---|
| NFR-024 | High | The system shall use a modular architecture. |
| NFR-025 | Medium | The system shall separate Zotero integration, AI provider integration, local retrieval, workflow orchestration, and UI concerns. |
| NFR-026 | Medium | The system shall support replacement of AI providers without redesigning paper-analysis workflows. |
| NFR-027 | Medium | The system shall support replacement of the local retrieval backend without redesigning analysis workflows. |

### 10.6 Offline Capability

| ID | Granularität | Anforderung |
|---|---:|---|
| NFR-028 | High | The system shall support offline use for workflows that do not require external AI providers. |
| NFR-029 | Medium | The system shall allow users to use locally hosted AI models while offline. |
| NFR-030 | Medium | The system shall allow users to access and query the local retrieval index while offline. |
| NFR-031 | Detailed | The system shall allow users to view previously generated notes, highlights, summaries, and analysis results while offline. |
| NFR-032 | Detailed | The system shall not require internet connectivity for local index access, local result display, or local model workflows. |

---

## 11. Constraints, Assumptions, and Dependencies

### 11.1 Constraints

| ID | Einschränkung |
|---|---|
| CON-001 | The system shall operate as a Zotero extension in the MVP. |
| CON-002 | The system shall process only documents already present in the user’s Zotero library. |
| CON-003 | The system shall not retrieve or import papers from external sources in the MVP. |
| CON-004 | The system shall not provide external editor integration in the MVP. |
| CON-005 | The system shall not perform general Zotero library organization in the MVP. |
| CON-006 | The system shall not move papers between Zotero collections in the MVP. |
| CON-007 | The system shall keep local embeddings and index data on the user’s device. |
| CON-008 | The system shall not provide standalone semantic search in the MVP. |

### 11.2 Assumptions

| ID | Annahme |
|---|---|
| ASM-001 | [ASSUMPTION] Zotero exposes sufficient extension APIs to read PDFs, annotations, notes, tags, metadata, and create notes, tags, and highlights. |
| ASM-002 | [ASSUMPTION] A local embedded vector or hybrid retrieval backend can be integrated into the Zotero extension environment. |
| ASM-003 | [ASSUMPTION] Local model support will depend on user-provided local model infrastructure. |
| ASM-004 | [ASSUMPTION] Codex and GitHub Copilot integrations are technically feasible or can be abstracted as provider integrations if accessible. |
| ASM-005 | [ASSUMPTION] AI-generated Zotero artifacts do not need to be labeled as AI-generated in the MVP. |
| ASM-006 | [ASSUMPTION] The first implementation may use a local file-based index that can be rebuilt from Zotero data. |
| ASM-007 | [ASSUMPTION] Offline functionality applies only to features that do not require external AI providers. |
| ASM-008 | [ASSUMPTION] Users accept automatic writing of generated tags, highlights, and notes after explicitly starting the corresponding workflow. |

### 11.3 Dependencies

| ID | Abhängigkeit |
|---|---|
| DEP-001 | Zotero extension API and compatibility with target Zotero versions |
| DEP-002 | Availability and stability of selected AI provider APIs |
| DEP-003 | Availability of local model endpoints for offline workflows |
| DEP-004 | Availability of local indexing or vector search library |
| DEP-005 | User-provided API credentials for external providers |
| DEP-006 | PDF text extraction quality |
| DEP-007 | Zotero annotation write capabilities |
| DEP-008 | Operating system support for secure credential storage |

---

## 12. Business Rules

| ID | Geschäftsregel |
|---|---|
| BR-001 | AI workflows shall be started only by explicit user action. |
| BR-002 | Local index updates may run automatically in the background if they remain local and do not trigger external AI requests. |
| BR-003 | Generated tags, notes, and highlights may be written automatically after the user starts the corresponding workflow. |
| BR-004 | Generated tags, notes, and highlights do not need to be labeled as AI-generated in the MVP. |
| BR-005 | Each standard Zotero annotation color may have one or more semantic meanings. |
| BR-006 | Default categories shall include methodology, results, literature, limitations, research question, data, and open points. |
| BR-007 | The system shall not alter Zotero collection organization in the MVP. |
| BR-008 | The system shall not send content to external providers during automatic local indexing. |
| BR-009 | The system shall treat the local retrieval index as derived data, not as the authoritative source. |
| BR-010 | Zotero library data remains the authoritative source for documents, notes, tags, and annotations. |

---

## 13. Conflict Resolution and Completeness Check

### 13.1 Identified Conflicts and Resolutions

| Konflikt-ID | Beschreibung | Entscheidung |
|---|---|---|
| CR-001 | Keine Hintergrundautomatik vs. automatische Indexaktualisierung | Gelöst: Keine automatische externe KI-Analyse; lokale Indexaktualisierung darf im Hintergrund erfolgen. |
| CR-002 | Automatisches Schreiben vs. Nutzerkontrolle | Gelöst: Automatisches Schreiben ist erlaubt, aber nur nach explizitem Workflow-Start. |
| CR-003 | Full-PDF-Analyse vs. Tokeneffizienz | Gelöst: Paper darf vollständig analysiert werden; bei großen Inhalten soll RAG/retrievalbasierte Kontextauswahl Token reduzieren. |
| CR-004 | Externe KI-Anbieter vs. Datenschutz | Gelöst: Externe Provider nur nach Nutzerstart; Embeddings und Index bleiben lokal. |
| CR-005 | Kollektionsanalyse gewünscht vs. MVP-Fokus | Gelöst: Kollektionsanalyse ist Produktvision/Post-MVP, aber nicht MVP-kritisch. |
| CR-006 | Semantische Suche gewünscht vs. MVP-Fokus | Gelöst: Standalone semantische Suche ist Future Scope; Retrieval wird intern im MVP genutzt. |

### 13.2 Completeness Check

| Bereich | Status |
|---|---|
| Systemvision | ausreichend definiert |
| Zielnutzer | ausreichend definiert |
| MVP-Scope | definiert |
| Out-of-Scope | definiert |
| Funktionsgruppen | definiert |
| KI-Anbieter | definiert, technische Machbarkeit teilweise offen |
| Farbsemantik | definiert |
| Paper-Analyse | definiert |
| Notizen | definiert |
| Tags | definiert |
| Highlights | definiert |
| Lokaler Index/RAG | definiert |
| Offline-Nutzung | definiert |
| Kollektionsanalyse | Post-MVP definiert |
| Semantische Suche | Future Scope definiert |
| Datenschutz | initial definiert |
| Externe Schnittstellen | initial definiert |
| Nicht-funktionale Anforderungen | initial definiert |
| Test-/Akzeptanzkriterien | noch auszuarbeiten |
| Architekturentscheidung für konkrete Libraries | offen |
| Technische Machbarkeit Zotero-Annotation-Write | Quellcode-geprüft; visuelle Live-Abnahme ausstehend |

### 13.3 Offene Punkte

| ID | Offener Punkt | Priorität |
|---|---|---:|
| OP-001 | **Erledigt 2026-07-15:** `saveFromJSON`-Write und Reader-Zeichengeometrie geprüft; Live-Smoke-Test bleibt Abnahmeschritt | hoch |
| OP-002 | Konkrete lokale RAG-/Vector-Store-Library auswählen | hoch |
| OP-003 | Machbarkeit GitHub Copilot Integration prüfen | hoch |
| OP-004 | Machbarkeit Codex Integration prüfen | hoch |
| OP-005 | Ziel-Zotero-Versionen definieren | hoch |
| OP-006 | Speicherort und Format der Plugin-Konfiguration definieren | mittel |
| OP-007 | Genaues UI-Konzept erstellen | mittel |
| OP-008 | Standard-Farbzuordnung definieren | mittel |
| OP-009 | Akzeptanzkriterien für generierte Highlights definieren | mittel |
| OP-010 | Evaluation der Ausgabequalität planen | mittel |

---

## 14. MVP Requirements Summary

### 14.1 MVP-kritische Anforderungen

| ID | Anforderung |
|---|---|
| MVP-001 | The system shall allow users to configure AI providers. |
| MVP-002 | The system shall allow users to configure semantic meanings for Zotero annotation colors. |
| MVP-003 | The system shall analyze one or more selected Zotero papers. |
| MVP-004 | The system shall automatically create colored highlights in selected Zotero PDFs after user initiation. |
| MVP-005 | The system shall generate Zotero notes from existing annotations and highlights. |
| MVP-006 | The system shall summarize existing Zotero notes and annotations. |
| MVP-007 | The system shall analyze, suggest, and create Zotero tags. |
| MVP-008 | The system shall build and update a local retrieval index. |
| MVP-009 | The system shall execute predefined prompt templates. |
| MVP-010 | The system shall execute free-form prompts. |
| MVP-011 | The system shall display generated results. |
| MVP-012 | The system shall save generated results as Zotero notes. |
| MVP-013 | The system shall keep embeddings and index data local. |
| MVP-014 | The system shall support offline use for local workflows. |

---

## 15. Recommended Initial Architecture

### 15.1 Architekturprinzipien

| Prinzip | Beschreibung |
|---|---|
| Modularität | KI-Provider, Zotero-Integration, Retrieval, Workflows und UI getrennt halten |
| Lokale Datenhoheit | Embeddings, Index und Retrieval-Daten lokal speichern |
| Provider-Abstraktion | Externe und lokale Modelle über ein gemeinsames Interface anbinden |
| Rebuildable Index | Lokaler Index ist Cache, nicht authoritative data source |
| User-Initiated AI | Externe KI-Anfragen nur nach explizitem Nutzerstart |
| Future Extensibility | Kollektionsanalyse, semantische Suche und Editor-Integrationen vorbereiten |

### 15.2 Vorgeschlagene Hauptkomponenten

| Komponente | Verantwortung |
|---|---|
| Zotero Adapter | Lesen und Schreiben von Zotero-Items, PDFs, Annotationen, Notes, Tags |
| AI Provider Manager | Verwaltung externer und lokaler KI-Anbieter |
| Prompt Manager | Vorlagen, freie Prompts, Prompt-Komposition |
| Color Semantics Manager | Farb-Bedeutungs-Konfiguration |
| Local Index Manager | Indexaufbau, Synchronisierung, Rebuild |
| Retrieval Engine | Semantische, keywordbasierte und hybride Suche |
| Workflow Orchestrator | Ausführung von Paper-Analyse, Highlighting, Notizgenerierung, Tagging |
| Result Renderer | Ergebnisansicht |
| Persistence Manager | Speichern von Konfiguration und generierten Ergebnissen |
| Error/Status Manager | Fortschritt, Fehler und Statusmeldungen |

---

## 16. Suggested Next Engineering Steps

1. Zotero-Plugin-API prüfen: Lesen/Schreiben von Annotationen, Highlights, Notes und Tags.
2. Minimales Plugin-Skeleton erstellen.
3. Lokales Konfigurationsmodell definieren.
4. Provider-Abstraktion für OpenAI-kompatible Endpunkte und lokale Modelle entwerfen.
5. Machbarkeit Codex und GitHub Copilot prüfen.
6. PDF-Text-Extraktion und Annotation-Extraktion prototypisieren.
7. Lokalen Index-Prototyp bauen.
8. Automatisches Highlighting in Zotero testen.
9. Paper-Analyse-Workflow MVP implementieren.
10. Notizgenerierung und Tagging implementieren.
11. UI für Farbkonfiguration und Ergebnisansicht bauen.
12. Erste Testfälle und Akzeptanzkriterien ableiten.

---

## 17. Traceability Matrix

| Ziel | Abgedeckt durch Anforderungen |
|---|---|
| Bessere Auffindbarkeit von Annotationen | FR-003, FR-005, FR-006, FR-008, FR-091 |
| Automatische Markierungen | FR-004, FR-041 bis FR-048, FR-102 bis FR-112 |
| Farbsemantik | FR-002, FR-023 bis FR-031 |
| Notizen aus Markierungen | FR-005, FR-049 bis FR-056 |
| Tags | FR-007, FR-057 bis FR-064 |
| Tokeneffizienz | FR-008, FR-065 bis FR-079, NFR-001 bis NFR-006 |
| Offline-Nutzung | NFR-028 bis NFR-032 |
| Datenschutz | NFR-007 bis NFR-012 |
| Provider-Flexibilität | FR-001, FR-013 bis FR-022, EIR-007 bis EIR-014 |
| Zukunft Kollektionsanalyse | FR-099 bis FR-101 |
| Zukunft semantische Suche | FUT-003 |

---

## 18. Notes on Requirement Quality

Formale Anforderungen wurden möglichst atomar, verifizierbar und implementierungsunabhängig formuliert. Einige Punkte sind bewusst als `[ASSUMPTION]` markiert, weil sie aus dem Interviewverlauf abgeleitet wurden und später fachlich oder technisch bestätigt werden müssen.

---

## 19. End of Document

Dieses Dokument bildet die Arbeitsgrundlage für den Start der Entwicklung und kann im Projektverzeichnis abgelegt werden.
