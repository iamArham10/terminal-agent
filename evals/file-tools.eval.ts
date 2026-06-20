import { evaluate } from "@lmnr-ai/lmnr";
import { singleTurnExecutorWithMocks } from "./executors";
import dataset from "./data/file-tools.json" with { type: "json" };
import type { EvalData } from "./types";
import { toolSelectionScore } from "./evaluators";

const executor = async (data: EvalData) => {
    return singleTurnExecutorWithMocks(data);
};

evaluate({
    data: dataset as any,
    executor,
    evaluators: {
        selectionScore: (output: any, target: any) => {
            if (target?.category === "secondary") return 1;
            return toolSelectionScore(output, target);
        },
    },
    groupName: "file-tools-selection",
});
