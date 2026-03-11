// costLogger.ts
// Shared utility for system-level cost accounting
// Tracks "Atomic Truth" of AI costs across all modalities
import type { SupabaseClient } from "./types.ts";

// Types matching the DB schema
export type CostSource =
    | 'chat_page_llm'
    | 'folder_llm'
    | 'together_mode_llm'
    | 'labeler_llm'
    | 'memory_extraction'
    | 'pattern_extraction'
    | 'meme_llm'
    | 'meme_image'
    | 'image_generation'
    | 'stt'
    | 'tts'
    | 'signal_lab_llm';

export type CostModality =
    | 'text'
    | 'image'
    | 'video'
    | 'audio'
    | 'unknown';

export type UnitType = 'tokens' | 'chars' | 'seconds' | 'images';

interface PricingModel {
    inputCostPerUnit: number;
    outputCostPerUnit: number;
    unitType: UnitType; // For both input/output usually, or primary type
    description: string;
}

// ------------------------------------------------------------------
// PRICING CONFIGURATION
// ------------------------------------------------------------------
// Costs are in USD.
// Update these values as pricing changes.
// ------------------------------------------------------------------

export const PricingConfig: Record<string, PricingModel> = {
    // LLMs (per-token; 1M tokens = 1_000_000 units. Align with SUBSCRIPTION_COSTS_AND_MARGINS.md.)
    'gemini-3-flash-preview': {
        inputCostPerUnit: 0.0000005,  // $0.50 per 1M input
        outputCostPerUnit: 0.0000005,  // $0.50 per 1M output (50c/1M out)
        unitType: 'tokens',
        description: 'Gemini 3.0 Flash Preview'
    },
    'gemini-2.5-flash': {
        inputCostPerUnit: 0.0000003,  // $0.30 per 1M input
        outputCostPerUnit: 0.0000002,  // $0.20 per 1M output (20c/1M out)
        unitType: 'tokens',
        description: 'Gemini 2.5 Flash'
    },
    'gemini-2.0-flash-exp': {
        inputCostPerUnit: 0.0000001, // ~$0.10 per 1M tokens
        outputCostPerUnit: 0.0000004, // ~$0.40 per 1M tokens
        unitType: 'tokens',
        description: 'Gemini 2.0 Flash Experimental'
    },
    'gemini-2.0-flash-001': {
        inputCostPerUnit: 0.0000001,
        outputCostPerUnit: 0.0000004,
        unitType: 'tokens',
        description: 'Gemini 2.0 Flash Production'
    },
    'gemini-1.5-flash': {
        inputCostPerUnit: 0.000000075, // Lower tier example
        outputCostPerUnit: 0.0000003,
        unitType: 'tokens',
        description: 'Gemini 1.5 Flash'
    },
    'gemini-1.5-pro': {
        inputCostPerUnit: 0.0000035,
        outputCostPerUnit: 0.0000105,
        unitType: 'tokens',
        description: 'Gemini 1.5 Pro'
    },
    // Mistral
    'mistral-large-latest': {
        inputCostPerUnit: 0.0000004, // $0.40 per 1M input
        outputCostPerUnit: 0.000002, // $2.00 per 1M output
        unitType: 'tokens',
        description: 'Mistral Large Latest'
    },
    'mistral-large-2411': {
        inputCostPerUnit: 0.0000004,
        outputCostPerUnit: 0.000002,
        unitType: 'tokens',
        description: 'Mistral Large 2411'
    },
    'mistral-medium-latest': {
        inputCostPerUnit: 0.0000004,
        outputCostPerUnit: 0.000002,
        unitType: 'tokens',
        description: 'Mistral Medium Latest'
    },
    'mistral-small-latest': {
        inputCostPerUnit: 0.0000004,
        outputCostPerUnit: 0.000002,
        unitType: 'tokens',
        description: 'Mistral Small Latest'
    },
    // Voice
    'google-stt-standard': {
        // Let's assume standard Google STT pricing for now: $0.016 / min = ~0.00026
        inputCostPerUnit: 0.00026,
        outputCostPerUnit: 0,
        unitType: 'seconds',
        description: 'Google Speech-to-Text Standard'
    },
    'google-stt-chirp': {
        // Chirp is more expensive, often $0.024/min
        inputCostPerUnit: 0.0004,
        outputCostPerUnit: 0,
        unitType: 'seconds',
        description: 'Google Chirp STT'
    },
    'google-tts-neural': {
        // $16.00 USD per 1 million characters (Neural2/WaveNet; we use Chirp3 HD instead)
        inputCostPerUnit: 0.000016,
        outputCostPerUnit: 0,
        unitType: 'chars',
        description: 'Google TTS Neural2/WaveNet'
    },
    'google-tts-chirp3-hd': {
        // Chirp 3 HD: $30 per 1M characters (SUBSCRIPTION_COSTS_AND_MARGINS.md). Used by ttsService.
        inputCostPerUnit: 0.00003,
        outputCostPerUnit: 0,
        unitType: 'chars',
        description: 'Google TTS Chirp 3 HD'
    },
    // Image — app uses Imagen 4 Fast only ($0.02 per image)
    'imagen-4.0': {
        inputCostPerUnit: 0.02,
        outputCostPerUnit: 0,
        unitType: 'images',
        description: 'Imagen 4.0 (legacy alias; app uses Imagen 4 Fast)'
    },
    'imagen-4.0-fast-generate-001': {
        inputCostPerUnit: 0.02, // $0.02 per image (aligned with SUBSCRIPTION_COSTS_AND_MARGINS.md)
        outputCostPerUnit: 0,
        unitType: 'images',
        description: 'Imagen 4 Fast'
    },
    'gemini-2.5-flash-image': {
        inputCostPerUnit: 0.039, // $0.039 per image (Gemini 2.5 Flash Image / Nano Banana; ai.google.dev/pricing)
        outputCostPerUnit: 0,
        unitType: 'images',
        description: 'Gemini 2.5 Flash Image (Nano Banana)'
    },
    'titan-image-generator': {
        inputCostPerUnit: 0.016,
        outputCostPerUnit: 0,
        unitType: 'images',
        description: 'Amazon Titan'
    },
    // Generic aliases used in code
    'google-stt': {
        inputCostPerUnit: 0.0004, // Default to chirp pricing
        outputCostPerUnit: 0,
        unitType: 'seconds',
        description: 'Google STT (Generic)'
    },
    'google-tts': {
        // We only use Chirp 3 HD (en-US-Chirp3-HD-*). $30/1M chars = $0.00003/char. Align with SUBSCRIPTION_COSTS_AND_MARGINS.md.
        inputCostPerUnit: 0.00003,
        outputCostPerUnit: 0,
        unitType: 'chars',
        description: 'Google TTS Chirp 3 HD (used by ttsService)'
    }
};

const AUD_CONVERSION_RATE = 1.6; // Fixed conservative rate. Update periodically.

// ------------------------------------------------------------------
// LOGGING FUNCTION
// ------------------------------------------------------------------

export interface LogCostPayload {
    source: CostSource;
    modality: CostModality;
    model: string;
    user_id?: string | undefined;
    chat_id?: string | undefined;
    session_id?: string | undefined;
    request_id?: string | undefined;
    input_units: number;
    output_units: number;
    metadata?: Record<string, unknown> | undefined;
}

export function logCostEvent(
    supabase: SupabaseClient,
    payload: LogCostPayload
): Promise<void> {
    // Delegate to batch function for single event
    return batchLogCostEvents(supabase, [payload]);
}

/**
 * Batch log multiple cost events in a single DB insert.
 * More efficient than calling logCostEvent multiple times.
 * Fire-and-forget - errors are logged but don't throw.
 */
export async function batchLogCostEvents(
    supabase: SupabaseClient,
    payloads: LogCostPayload[]
) {
    if (!payloads || payloads.length === 0) return;

    try {
        const rows = payloads.map(payload => {
            const pricing = PricingConfig[payload.model];

            // Fallback if model unknown (defaults to 0 cost, saves row for visibility)
            const pModel = pricing || {
                inputCostPerUnit: 0,
                outputCostPerUnit: 0,
                unitType: (payload.modality === 'image' ? 'images' : 'tokens') as UnitType,
                description: 'Unknown Model'
            };

            const costUSD = (payload.input_units * pModel.inputCostPerUnit) +
                (payload.output_units * pModel.outputCostPerUnit);

            const costAUD = costUSD * AUD_CONVERSION_RATE;

            // Map modality for DB constraint (only text, image, voice_stt, voice_tts allowed)
            const dbModality =
                payload.modality === 'image' ? 'image' as const
                    : payload.modality === 'audio' ? (payload.source === 'tts' ? 'voice_tts' as const : 'voice_stt' as const)
                        : 'text' as const;

            return {
                user_id: payload.user_id || null,
                chat_id: payload.chat_id || null,
                session_id: payload.chat_id || payload.session_id || null,
                request_id: payload.request_id || null,
                source: payload.source,
                modality: dbModality,
                model: payload.model,
                input_units: payload.input_units,
                output_units: payload.output_units,
                input_unit_type: pModel.unitType,
                output_unit_type: pModel.unitType,
                cost_usd: costUSD,
                cost_aud: costAUD,
                metadata: payload.metadata || {}
            };
        });

        const { error } = await supabase.from('system_cost_events').insert(rows);

        if (error) {
            console.error('[CostLogger] Error inserting events:', error);
            console.error('[CostLogger] Failed count:', rows.length);
        }
    } catch (err) {
        console.error('[CostLogger] unexpected exception:', err);
    }
}
