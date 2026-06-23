import { evaluate } from "@lmnr-ai/lmnr";
import { multiTurnWithMock } from "./executors";
import { llmJudge } from "./evaluators";
import type {
    MultiTurnEvalData,
    MultiTurnResult,
    MultiTurnTarget,
    MultiTurnDatasetEntry,
} from "./types";
import dataset from "./data/agent-multiturn.json" with { type: "json" };

const executor = async (data: MultiTurnEvalData) => {
    return multiTurnWithMock(data);
};

evaluate({
    data: dataset as any,
    executor,
    evaluators: {
        outputQuality: async (output: any, target: any) => {
            if (!target) return 1;
            return llmJudge(output, target);
        },
    },
    config: {
        projectApiKey: process.env.LAR_API_KEY,
    },
    groupName: "agent-multiturn",
});
