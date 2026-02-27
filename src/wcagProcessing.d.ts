import type { ContrastIssue, CaptureData, NonTextElement } from './types.js';
export declare function deduplicateFinalArrows(allTextNodes: any[]): any[];
export declare function processWCAG(textNodes: any[], captureData: CaptureData[], finalSectionBuffer: Buffer | null, nonTextOverlayElements?: any[]): Promise<{
    contrastIssues: ContrastIssue[];
    fontGroups: Record<string, Record<string, boolean>>;
    textColorAgg: Record<string, {
        score: number;
        elements: Set<string>;
    }>;
}>;
export declare function processNonTextElements(elements: any[], captureData: CaptureData[], finalSectionBuffer?: Buffer | null): Promise<NonTextElement[]>;
//# sourceMappingURL=wcagProcessing.d.ts.map