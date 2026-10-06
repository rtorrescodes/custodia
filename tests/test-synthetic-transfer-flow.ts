import { reportOwnerContributionAction, verifyOwnerContributionAction } from "../src/app/actions/property-operations.actions";
import { prisma } from "../src/lib/prisma";

async function testSyntheticFlow() {
  const dummyPdf = "%PDF-1.5 test synthetic receipt " + Date.now();
  const base64Data = Buffer.from(dummyPdf).toString("base64");
  
  console.log("--- 1. Reportando transferencia para Bomba Hidroneumática ---");
  const repRes = await reportOwnerContributionAction({
    contributionId: "2fd1b14d-b198-49ec-8517-b2d3ccee6b40",
    reference: "SPEI-BBVA-12345678",
    reportedAmount: 6500,
    reportedCurrency: "MXN",
    transferDate: new Date().toISOString().split("T")[0],
    fileBase64: base64Data,
    fileName: "comprobante_bomba.pdf",
    notes: "Transferencia realizada desde app BBVA"
  });
  console.log("Resultado reporte:", repRes);

  const contribAfterReport = await prisma.ownerContribution.findUnique({
    where: { id: "2fd1b14d-b198-49ec-8517-b2d3ccee6b40" }
  });
  console.log("Estado DB tras reporte:", {
    status: contribAfterReport?.status,
    evidenceUrl: contribAfterReport?.evidenceUrl,
    reference: contribAfterReport?.reference,
    reportedAt: contribAfterReport?.reportedAt
  });

  console.log("\n--- 2. PM verifica recepción de la transferencia ---");
  const verRes = await verifyOwnerContributionAction({
    contributionId: "2fd1b14d-b198-49ec-8517-b2d3ccee6b40",
    verifiedAmount: 6500,
    verifiedNotes: "Confirmado abono en cuenta BBVA PM Escrow"
  });
  console.log("Resultado verificación:", verRes);

  const contribAfterVerify = await prisma.ownerContribution.findUnique({
    where: { id: "2fd1b14d-b198-49ec-8517-b2d3ccee6b40" }
  });
  console.log("Estado DB tras verificación:", {
    status: contribAfterVerify?.status,
    verifiedAt: contribAfterVerify?.verifiedAt,
    availableAt: contribAfterVerify?.availableAt
  });
}

testSyntheticFlow().catch(console.error);
