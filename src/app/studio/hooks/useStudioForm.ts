import { useState } from "react";
import { StudioMode, StudioTone } from "../types";
import { TONES } from "../constants";

export function useStudioForm() {
    const [targetNames, setTargetNames] = useState("");
    const [context, setContext] = useState("");
    const [optionalDate, setOptionalDate] = useState("");
    const [studioMode, setStudioMode] = useState<StudioMode>("images");
    const [selectedTones, setSelectedTones] = useState<Set<StudioTone>>(new Set(TONES));
    
    // Result feedback states
    const [isGenerating, setIsGenerating] = useState(false);
    const [hasGenerated, setHasGenerated] = useState(false);

    const toggleTone = (tone: StudioTone) => {
        setSelectedTones((prev) => {
            const next = new Set(prev);
            if (next.has(tone)) {
                if (next.size === 1) return prev; // always keep at least 1 selected
                next.delete(tone);
            } else {
                next.add(tone);
            }
            return next;
        });
    };

    return {
        targetNames, setTargetNames,
        context, setContext,
        optionalDate, setOptionalDate,
        studioMode, setStudioMode,
        selectedTones, setSelectedTones,
        toggleTone,
        isGenerating, setIsGenerating,
        hasGenerated, setHasGenerated
    };
}
