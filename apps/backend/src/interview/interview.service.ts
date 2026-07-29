import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { LlmService } from '../llm/llm.service';
import { ProjectsService } from '../projects/projects.service';
import { InterviewSessionEntity } from '../database/entities';

// Very permissive schemas — LLMs often return inconsistent shapes
const QuestionItem = z.object({
  question: z.union([z.string(), z.null(), z.undefined()]).optional().default(''),
  context: z.union([z.string(), z.null(), z.undefined()]).optional().default(''),
  type: z.union([z.string(), z.null(), z.undefined()]).optional().default('clarification'),
}).passthrough();

const FirstQuestionSchema = z.object({
  questions: z.array(QuestionItem).optional().default([]),
  canProceed: z.union([z.boolean(), z.string(), z.null(), z.undefined()]).optional().default(false),
  summary: z.union([z.string(), z.null(), z.undefined()]).optional(),
}).passthrough();

const FollowUpSchema = z.object({
  response: z.union([z.string(), z.null(), z.undefined()]).optional().default(''),
  questions: z.array(QuestionItem).optional().default([]),
  canProceed: z.union([z.boolean(), z.string(), z.null(), z.undefined()]).optional().default(false),
  summary: z.union([z.string(), z.null(), z.undefined()]).optional(),
  compiledIdea: z.union([z.string(), z.record(z.any()), z.null(), z.undefined()]).optional(),
}).passthrough();

const SYSTEM_PROMPT = `You are an expert requirements interviewer for a software engineering platform called "AI Requirements Platform". You MUST always respond with a valid JSON object in every message — this is critical.

Your job is to ask smart, targeted questions to gather complete and accurate software requirements.

IMPORTANT: Always respond in JSON format. Your response must be parseable as JSON.
For initial questions use: { "questions": [{"question": "your question here", "context": "optional context", "type": "clarification"}], "canProceed": false }
For follow-ups use: { "response": "summary of what user said", "questions": [{"question": "...", "type": "..."}], "canProceed": false, "compiledIdea": "only when done" }

Guidelines:
1. Ask ONE question at a time — no more than 2-3 in the questions array  
2. Questions should be specific and actionable
3. Cover: scope, users, features, technical constraints, business goals
4. When you have enough info, set canProceed: true and provide a compiledIdea
5. The compiledIdea should be a thorough synthesis of all requirements gathered
6. Keep questions conversational and friendly
7. Don't ask more than 8-10 total questions across the entire interview

The word JSON is used throughout these instructions. Your output must be JSON.`;

function coerceBoolean(val: unknown): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') return val.toLowerCase() === 'true' || val === 'yes';
  return false;
}

function safeJsonParse(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    // Try extracting JSON from markdown code block
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[1].trim()); } catch { /* fall through */ }
    }
    // Try finding first { to last }
    const braceStart = raw.indexOf('{');
    const braceEnd = raw.lastIndexOf('}');
    if (braceStart >= 0 && braceEnd > braceStart) {
      try { return JSON.parse(raw.slice(braceStart, braceEnd + 1)); } catch { /* fall through */ }
    }
  }
  return {};
}

@Injectable()
export class InterviewService {
  private readonly logger = new Logger(InterviewService.name);

  constructor(
    @InjectRepository(InterviewSessionEntity)
    private readonly sessionRepo: Repository<InterviewSessionEntity>,
    private readonly llm: LlmService,
    private readonly projectsService: ProjectsService,
  ) {}

  async startInterview(name: string, initialIdea?: string): Promise<InterviewSessionEntity> {
    const session = this.sessionRepo.create({
      id: randomUUID(),
      projectName: name,
      idea: initialIdea || '',
      history: [],
      status: 'in_progress',
    });

    if (initialIdea?.trim()) {
      session.history.push({ role: 'user', content: initialIdea });
    }

    const firstQuestions = await this.generateQuestions(session);
    for (const q of firstQuestions) {
      const text = typeof q.question === 'string' && q.question ? q.question : 'Tell me more about your project.';
      session.history.push({ role: 'ai', content: text });
    }

    await this.sessionRepo.save(session);
    this.logger.log('Started interview session ' + session.id + ' for "' + name + '"');
    return session;
  }

  async answerQuestion(
    sessionId: string,
    answer: string,
  ): Promise<{ session: InterviewSessionEntity; complete: boolean; projectId?: string; newQuestions?: string[]; error?: string }> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Interview session not found');

    session.history.push({ role: 'user', content: answer });

    let followUp: z.infer<typeof FollowUpSchema>;
    try {
      followUp = await this.generateFollowUp(session);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error('Follow-up generation failed: ' + msg);
      const genericQuestion = 'Could you elaborate on that? What specific features or functionality are you looking for?';
      session.history.push({ role: 'ai', content: genericQuestion });
      await this.sessionRepo.save(session);
      return { session, complete: false, newQuestions: [genericQuestion], error: msg };
    }

    const rawIdea = followUp.compiledIdea;
    const finalIdea = typeof rawIdea === 'object' && rawIdea !== null
      ? JSON.stringify(rawIdea, null, 2)
      : (typeof rawIdea === 'string' ? rawIdea : '');

    const canProceed = coerceBoolean(followUp.canProceed);

    if (canProceed && finalIdea.length >= 20) {
      session.status = 'complete';

      // Restructure the compiled idea through LLM for clean, readable output
      let restructuredIdea: string;
      try {
        restructuredIdea = await this.restructureIdea(session.projectName, finalIdea);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn('Idea restructuring failed, using raw: ' + msg);
        restructuredIdea = finalIdea;
      }
      session.idea = restructuredIdea;

      try {
        const project = await this.projectsService.create({
          name: session.projectName,
          idea: restructuredIdea,
        });
        await this.sessionRepo.save(session);
        this.logger.log('Interview ' + sessionId + ' complete — project ' + project.id + ' created');
        return { session, complete: true, projectId: project.id };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error('Failed to create project from interview: ' + msg);
        session.status = 'in_progress';
        const retryQuestion = 'I have enough information. Let me try creating the project again.';
        session.history.push({ role: 'ai', content: retryQuestion });
        await this.sessionRepo.save(session);
        return { session, complete: false, newQuestions: [retryQuestion], error: msg };
      }
    }

    const newQuestions: string[] = [];
    const qList = Array.isArray(followUp.questions) ? followUp.questions : [];
    if (qList.length === 0) {
      const defaultQ = 'Can you tell me more about your project requirements?';
      session.history.push({ role: 'ai', content: defaultQ });
      newQuestions.push(defaultQ);
    } else {
      for (const q of qList) {
        const text = typeof q.question === 'string' && q.question ? q.question : 'Could you elaborate on that?';
        session.history.push({ role: 'ai', content: text });
        newQuestions.push(text);
      }
    }

    await this.sessionRepo.save(session);
    return { session, complete: false, newQuestions };
  }

  async getSession(sessionId: string): Promise<InterviewSessionEntity> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Interview session not found');
    return session;
  }

  async continueSession(sessionId: string): Promise<InterviewSessionEntity> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Interview session not found');
    if (session.status === 'complete') {
      return session;
    }
    const lastMsg = session.history[session.history.length - 1];
    if (lastMsg && lastMsg.role === 'user') {
      try {
        const followUp = await this.generateFollowUp(session);
        const newQs: string[] = [];
        const qList = Array.isArray(followUp.questions) ? followUp.questions : [];
        for (const q of qList) {
          const text = typeof q.question === 'string' && q.question ? q.question : 'Could you elaborate on that?';
          session.history.push({ role: 'ai', content: text });
          newQs.push(text);
        }
        await this.sessionRepo.save(session);
      } catch {
        session.history.push({ role: 'ai', content: 'Please continue telling me about your project requirements.' });
        await this.sessionRepo.save(session);
      }
    }
    return session;
  }

  /** Use LLM to restructure raw JSON from interview into clean natural language */
  private async restructureIdea(projectName: string, rawIdea: string): Promise<string> {
    const trimmed = rawIdea.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return trimmed;
    }

    try {
      const prompt = 'Project: ' + projectName + '\n\nThe following is a raw compiled requirements JSON gathered from an AI interview. Restructure it into a clean, well-organized natural language project description. Include details about:\n\n- Project purpose and goals\n- Target users\n- Core features and functionality\n- Technical considerations\n- Key constraints or requirements\n\nWrite in clear paragraphs. Do not include JSON syntax or code blocks in your response.\n\nRaw input:\n' + trimmed.slice(0, 3000);

      const r = await this.llm.generateText([
        {
          role: 'system',
          content: 'You are a requirements analyst. Convert raw JSON requirements into a clear, well-structured natural language project description. Write in professional, readable prose. Do not output JSON.',
        },
        { role: 'user', content: prompt },
      ]);
      return r.content.trim();
    } catch (err: unknown) {
      this.logger.warn('LLM restructuring failed, using manual fallback');
      // Fallback: parse JSON and build readable text manually
      try {
        const obj = JSON.parse(trimmed);
        const parts: string[] = [];
        for (const [key, value] of Object.entries(obj)) {
          if (value === null || value === undefined) continue;
          const label = key.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').trim();
          if (typeof value === 'string' && value.length > 20) {
            parts.push(label + ': ' + value);
          } else if (Array.isArray(value)) {
            const items = value.filter(Boolean).map((v) => typeof v === 'string' ? v : JSON.stringify(v));
            if (items.length > 0) {
              parts.push(label + ':\n' + items.map((item) => '- ' + item).join('\n'));
            }
          }
        }
        return parts.length > 0 ? parts.join('\n\n') : trimmed;
      } catch {
        return trimmed;
      }
    }
  }

  private async generateQuestions(session: InterviewSessionEntity) {
    const context = session.history
      .slice(-4)
      .map((h: { role: string; content: string }) => (h.role === 'ai' ? 'AI' : 'User') + ': ' + h.content)
      .join('\n');
    const msg = 'Project: ' + session.projectName + '\n\nRecent conversation:\n' + context + '\n\nGenerate initial questions to clarify this software project. You must respond in valid JSON format.';

    const r = await this.llm.generateStructured([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: msg },
    ]);

    const parsed = safeJsonParse(r.content);
    const data = FirstQuestionSchema.parse(parsed);
    return Array.isArray(data.questions) ? data.questions : [];
  }

  private async generateFollowUp(session: InterviewSessionEntity) {
    const context = session.history
      .map((h: { role: string; content: string }) => (h.role === 'ai' ? 'AI' : 'User') + ': ' + h.content)
      .join('\n');
    const msg = 'Project: ' + session.projectName + '\n\nFull conversation:\n' + context + '\n\nBased on this conversation, decide if you have enough information. You must respond in valid JSON format. If yes, set canProceed:true and provide a thorough compiledIdea. If not, ask 1-2 focused follow-up questions.';

    const r = await this.llm.generateStructured([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: msg },
    ]);

    const parsed = safeJsonParse(r.content);
    return FollowUpSchema.parse(parsed);
  }
}
