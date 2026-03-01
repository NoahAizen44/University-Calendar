
import { GoogleGenAI, Type } from "@google/genai";
import { Assignment, Course, StudySession } from "../types";

function getGeminiApiKey() {
  const env = import.meta.env as Record<string, string | undefined>;
  return env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || '';
}

export const generateStudyPlan = async (
  assignments: Assignment[],
  courses: Course[],
  availableHoursPerDay: number
): Promise<StudySession[]> => {
  const apiKey = getGeminiApiKey();
  if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
    throw new Error('Missing Gemini API key. Set VITE_GEMINI_API_KEY in .env.local');
  }
  const ai = new GoogleGenAI({ apiKey });
  const model = 'gemini-2.5-flash';
  
  const prompt = `
    You are an expert academic advisor. Help a student create a study schedule.
    Courses: ${JSON.stringify(courses)}
    Current Assignments: ${JSON.stringify(assignments.filter(a => !a.completed))}
    Available hours for studying today: ${availableHoursPerDay}
    
    Rules:
    1. Prioritize assignments with earlier due dates and higher priority.
    2. Break large assignments into 1-2 hour study blocks.
    3. Include short 15-minute breaks after every 90 minutes of work.
    4. Generate a schedule for TODAY starting from now.
    5. Keep each block 30 to 120 minutes.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            startTime: { type: Type.STRING, description: "ISO 8601 format" },
            endTime: { type: Type.STRING, description: "ISO 8601 format" },
            assignmentId: { type: Type.STRING, description: "The ID of the related assignment if applicable" }
          },
          required: ["title", "startTime", "endTime"]
        }
      }
    }
  });

  try {
    // Access .text property directly
    const data = JSON.parse(response.text || '[]');
    return data;
  } catch (e) {
    console.error("Failed to parse AI response", e);
    return [];
  }
};
