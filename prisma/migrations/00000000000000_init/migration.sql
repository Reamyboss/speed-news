-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'NG',
    "region" TEXT NOT NULL DEFAULT 'ng',
    "language" TEXT NOT NULL DEFAULT 'en',
    "categories" TEXT NOT NULL DEFAULT 'nigeria',
    "url" TEXT NOT NULL,
    "rssUrl" TEXT,
    "apiUrl" TEXT,
    "socialUrls" TEXT,
    "trustTier" INTEGER NOT NULL DEFAULT 3,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "license" TEXT NOT NULL DEFAULT 'RSS_SUMMARY',
    "weight" INTEGER NOT NULL DEFAULT 50,
    "lastCheckedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "dek" TEXT,
    "summary" TEXT NOT NULL,
    "excerpt" TEXT,
    "canonicalUrl" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "author" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'ng',
    "language" TEXT NOT NULL DEFAULT 'en',
    "imageUrl" TEXT,
    "imageCredit" TEXT,
    "importance" INTEGER NOT NULL DEFAULT 50,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "urlHash" TEXT NOT NULL,
    "titleKey" TEXT NOT NULL,
    "simhash" TEXT NOT NULL,
    "clusterId" TEXT,
    "aiSummary" TEXT,
    "aiWhyItMatters" TEXT,
    "aiBullets" TEXT,
    "aiEntities" TEXT,
    "aiProvider" TEXT,
    "aiModel" TEXT,
    "aiStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "aiError" TEXT,
    "aiEnrichedAt" TIMESTAMP(3),
    "searchText" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryCluster" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'nigeria',
    "storyCount" INTEGER NOT NULL DEFAULT 1,
    "sourceCount" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastStoryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdSlot" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "placement" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'HOUSE',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "headline" TEXT,
    "body" TEXT,
    "imageUrl" TEXT,
    "clickUrl" TEXT,
    "label" TEXT NOT NULL DEFAULT 'Advertisement',
    "config" TEXT,
    "widthPx" INTEGER,
    "heightPx" INTEGER,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "sourcesAttempted" INTEGER NOT NULL DEFAULT 0,
    "sourcesSucceeded" INTEGER NOT NULL DEFAULT 0,
    "sourcesFailed" INTEGER NOT NULL DEFAULT 0,
    "itemsSeen" INTEGER NOT NULL DEFAULT 0,
    "itemsCreated" INTEGER NOT NULL DEFAULT 0,
    "itemsDuplicate" INTEGER NOT NULL DEFAULT 0,
    "itemsRejected" INTEGER NOT NULL DEFAULT 0,
    "clustersTouched" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT,

    CONSTRAINT "IngestRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Source_slug_key" ON "Source"("slug");

-- CreateIndex
CREATE INDEX "Source_status_type_idx" ON "Source"("status", "type");

-- CreateIndex
CREATE INDEX "Source_country_trustTier_idx" ON "Source"("country", "trustTier");

-- CreateIndex
CREATE UNIQUE INDEX "Story_slug_key" ON "Story"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Story_canonicalUrl_key" ON "Story"("canonicalUrl");

-- CreateIndex
CREATE UNIQUE INDEX "Story_urlHash_key" ON "Story"("urlHash");

-- CreateIndex
CREATE INDEX "Story_status_publishedAt_idx" ON "Story"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "Story_status_category_publishedAt_idx" ON "Story"("status", "category", "publishedAt");

-- CreateIndex
CREATE INDEX "Story_status_region_publishedAt_idx" ON "Story"("status", "region", "publishedAt");

-- CreateIndex
CREATE INDEX "Story_clusterId_idx" ON "Story"("clusterId");

-- CreateIndex
CREATE INDEX "Story_sourceId_publishedAt_idx" ON "Story"("sourceId", "publishedAt");

-- CreateIndex
CREATE INDEX "Story_titleKey_idx" ON "Story"("titleKey");

-- CreateIndex
CREATE INDEX "Story_simhash_idx" ON "Story"("simhash");

-- CreateIndex
CREATE INDEX "Story_aiStatus_idx" ON "Story"("aiStatus");

-- CreateIndex
CREATE UNIQUE INDEX "StoryCluster_key_key" ON "StoryCluster"("key");

-- CreateIndex
CREATE INDEX "StoryCluster_category_lastStoryAt_idx" ON "StoryCluster"("category", "lastStoryAt");

-- CreateIndex
CREATE INDEX "StoryCluster_lastStoryAt_idx" ON "StoryCluster"("lastStoryAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdSlot_key_key" ON "AdSlot"("key");

-- CreateIndex
CREATE INDEX "AdSlot_placement_enabled_priority_idx" ON "AdSlot"("placement", "enabled", "priority");

-- CreateIndex
CREATE INDEX "IngestRun_startedAt_idx" ON "IngestRun"("startedAt");

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "StoryCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

