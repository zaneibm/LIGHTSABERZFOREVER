import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
dotenv.config();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
for (const model of ['gemini-3.6-flash','gemini-3-flash-preview','gemini-3.1-flash-lite']) {
  try {
    const r = await ai.models.generateContent({ model, contents: [{role:'user',parts:[{text:'Find me a free 1 hour slot'}]}] as any,
      config: { systemInstruction: 'You are a calendar bot', responseMimeType: 'application/json',
        responseSchema: { type: Type.OBJECT, properties: { reply: { type: Type.STRING }, actions: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { type: {type: Type.STRING}, durationMinutes: { type: Type.INTEGER }, autoFindSlot: {type: Type.BOOLEAN} } } } }, required: ['reply','actions'] } } });
    console.log(model, 'text=', JSON.stringify(r.text)?.slice(0,200), 'finish=', r.candidates?.[0]?.finishReason);
  } catch (e: any) { console.log(model, 'ERR', String(e?.message).slice(0,200)); }
}
