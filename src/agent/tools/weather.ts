import { tool } from "ai";
import z from "zod";

export const getWeather = tool({
    description: "Get current weather status of a specified city",
    inputSchema: z.object({
        city: z.string().describe("The name of the city, e.g. London"),
    }),
    execute: async ({ city }, { toolCallId, messages }) => {
        const temperatures = ["12°C", "18°C", "22°C", "27°C", "31°C"];
        const randomTemp =
            temperatures[Math.floor(Math.random() * temperatures.length)];
        console.log("toolCallId:", toolCallId);
        console.log("messages:", JSON.stringify(messages, null, 2));
        return `The weather in the city ${city} is ${randomTemp}°C`;
    },
});
