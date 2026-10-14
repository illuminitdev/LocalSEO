import dotenv from 'dotenv';
dotenv.config({ override: true });

async function main() {
    const { rerunUnrankedAiVisibility } = await import('../lib/leadGbpEnrich');
    const result = await rerunUnrankedAiVisibility();
    console.log('[rerun-ai-visibility]', result);
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
