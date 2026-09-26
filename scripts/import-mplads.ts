import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CSV_PATH = path.join(
  process.cwd(),
  "data",
  "mplads-works.csv"
);

function clean(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;

  const result = String(value).trim();

  return result === "" ? undefined : result;
}

function numberValue(value: unknown): number | undefined {
  const cleaned = clean(value);

  if (!cleaned) return undefined;

  const number = Number(
    cleaned
      .replace(/₹/g, "")
      .replace(/,/g, "")
      .replace(/%/g, "")
      .trim()
  );

  return Number.isFinite(number) ? number : undefined;
}

function dateValue(value: unknown): Date | undefined {
  const cleaned = clean(value);

  if (!cleaned) return undefined;

  const date = new Date(cleaned);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

function progressValue(value: unknown): number | undefined {
  const number = numberValue(value);

  if (number === undefined) return undefined;

  // Allow both 0.72 and 72 formats.
  if (number >= 0 && number <= 1) {
    return number * 100;
  }

  return Math.min(Math.max(number, 0), 100);
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(
      `CSV file not found: ${CSV_PATH}`
    );
  }

  console.log("Reading:", CSV_PATH);

  const csv = fs.readFileSync(CSV_PATH, "utf8");

  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: true,
  });

  console.log(`Found ${rows.length} rows`);

  const batchId =
    `MPLADS-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  let validRows = 0;
  let rejectedRows = 0;

  const errors: unknown[] = [];

  for (const row of rows as Record<string, unknown>[]) {
    try {
      const workId =
        clean(row.workId) ||
        clean(row["Work ID"]) ||
        clean(row["Work Id"]);

      const title =
        clean(row.title) ||
        clean(row["Work Name"]) ||
        clean(row["Work Name / Description"]);

      const stateName =
        clean(row.state) ||
        clean(row["State"]);

      const districtName =
        clean(row.district) ||
        clean(row["District Name"]);

      const mpName =
        clean(row.mpName) ||
        clean(row["MP Name"]) ||
        clean(row["Member"]);

      if (!workId || !title) {
        rejectedRows++;

        errors.push({
          workId,
          reason: "Missing workId or title",
        });

        continue;
      }

      /*
       * Find or create state.
       */
      let stateId: string | undefined;

      if (stateName) {
        const state = await prisma.state.upsert({
          where: {
            name: stateName,
          },
          update: {},
          create: {
            name: stateName,
            code:
              stateName
                .toUpperCase()
                .replace(/[^A-Z]/g, "")
                .slice(0, 10) ||
              `STATE-${Date.now()}`,
          },
        });

        stateId = state.id;
      }

      /*
       * Find/create district.
       */
      let districtId: string | undefined;

      if (districtName && stateId) {
        const district = await prisma.district.upsert({
          where: {
            name_stateId: {
              name: districtName,
              stateId,
            },
          },
          update: {},
          create: {
            name: districtName,
            stateId,
          },
        });

        districtId = district.id;
      }

      /*
       * We deliberately do not invent MP IDs.
       *
       * If the CSV contains an official constituency/MP identifier,
       * it can be mapped later.
       */
      let mpConstituencyId: string | undefined;

      const constituencyName =
        clean(row.constituency) ||
        clean(row["Constituency"]);

      const officialMpId =
        clean(row.mpId) ||
        clean(row["MP ID"]);

      if (
        constituencyName &&
        stateId &&
        officialMpId &&
        mpName
      ) {
        const constituency =
          await prisma.mpConstituency.upsert({
            where: {
              mpId: officialMpId,
            },
            update: {
              name: constituencyName,
              mpName,
              stateId,
            },
            create: {
              mpId: officialMpId,
              name: constituencyName,
              mpName,
              stateId,
            },
          });

        mpConstituencyId = constituency.id;
      }

      const sanctioned =
        numberValue(
          row.fundSanctioned ??
          row["Fund Sanctioned"] ??
          row["Sanctioned Amount"] ??
          row["Sanctioned"]
        ) ?? 0;

      const utilized =
        numberValue(
          row.fundUtilized ??
          row["Fund Utilized"] ??
          row["Expenditure"] ??
          row["Expenditure (Rs.)"]
        ) ?? 0;

      const physicalProgress =
        progressValue(
          row.physicalProgress ??
          row["Physical Progress"] ??
          row["Physical Progress (%)"]
        );

      const financialProgress =
        progressValue(
          row.financialProgress ??
          row["Financial Progress"] ??
          row["Financial Progress (%)"]
        );

      const sourceName =
        clean(row.sourceName) ||
        "MPLADS Official Portal";

      const sourceUrl =
        clean(row.sourceUrl) ||
        "https://www.mplads.gov.in/";

      const status =
        clean(row.status) ||
        clean(row["Work Status"]) ||
        "unknown";

      const workData = {
        workId,
        title,
        description:
          clean(row.description) ||
          title,

        category:
          clean(row.category) ||
          clean(row["Work Type"]) ||
          "unknown",

        financialYear:
          clean(row.financialYear) ||
          clean(row["Financial Year"]),

        sector:
          clean(row.sector) ||
          clean(row["Sector"]),

        subSector:
          clean(row.subSector) ||
          clean(row["Sub Sector"]),

        implementingAgency:
          clean(row.implementingAgency) ||
          clean(row["Agency"]) ||
          clean(row["Implementing Agency"]),

        nodalDistrict:
          clean(row.nodalDistrict) ||
          clean(row["Nodal District"]),

        block:
          clean(row.block) ||
          clean(row["Block Name"]),

        village:
          clean(row.village) ||
          clean(row["Village Name"]),

        mpConstituencyId,

        districtId,

        stateId,

        fundSanctioned: sanctioned,

        fundUtilized: utilized,

        physicalProgress,

        financialProgress,

        recommendationDate:
          dateValue(
            row.recommendationDate ??
            row["Recommendation Date"]
          ),

        sanctionDate:
          dateValue(
            row.sanctionDate ??
            row["Sanction Date"]
          ),

        startDate:
          dateValue(
            row.startDate ??
            row["Start Date"]
          ),

        endDate:
          dateValue(
            row.endDate ??
            row["Expected Completion Date"]
          ),

        completionDate:
          dateValue(
            row.completionDate ??
            row["Completion Date"]
          ),

        latitude:
          numberValue(
            row.latitude ??
            row["Latitude"]
          ),

        longitude:
          numberValue(
            row.longitude ??
            row["Longitude"]
          ),

        status,

        sourceName,

        sourceUrl,

        sourceRecordId:
          clean(row.sourceRecordId) ||
          workId,

        importedAt: new Date(),

        ingestionBatchId: batchId,
      };

      await prisma.work.upsert({
        where: {
          workId,
        },
        update: workData,
        create: workData,
      });

      validRows++;

      if (validRows % 50 === 0) {
        console.log(`Imported ${validRows}/${rows.length}`);
      }
    } catch (error) {
      rejectedRows++;

      errors.push({
        row,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }

  await prisma.ingestionBatch.create({
    data: {
      batchId,
      entityType: "WORK",
      totalRows: rows.length,
      validRows,
      rejectedRows,
      qualityReport: JSON.stringify({
        source: "MPLADS Official Portal",
        importedAt: new Date().toISOString(),
        errors,
      }),
    },
  });

  console.log("");
  console.log("================================");
  console.log("MPLADS IMPORT COMPLETE");
  console.log("================================");
  console.log(`Batch: ${batchId}`);
  console.log(`Total: ${rows.length}`);
  console.log(`Imported: ${validRows}`);
  console.log(`Rejected: ${rejectedRows}`);
  console.log("================================");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });