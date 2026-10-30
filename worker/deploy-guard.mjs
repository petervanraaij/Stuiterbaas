// This retained historical Worker is not the production source of truth.
// Deploying it would overwrite the shared Lattenspecialist/Stuiterbaas service.
console.error("Publiceren geblokkeerd: deze historische Worker is vervangen door de gedeelde reserveringsdienst in petervanraaij/Lattenspecialist (worker/). Publiceer vanuit die centrale bron na beide reserveringsstromen te testen.");
process.exitCode = 1;
