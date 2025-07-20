import { config } from "dotenv";
import express, { Request, Response } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import cors from "cors";
import fs from "fs";
import Irys from "@irys/sdk";
import path from "path";

// Explicitly load the .env file from the same directory as api.ts
config({ path: path.resolve(__dirname, ".env") });

// --- Irys Helper Function ---
const getIrys = async () => {
  const network = "devnet"; // Use "mainnet" for production
  const providerUrl = process.env.INFURA_RPC; // e.g., from Infura or Alchemy
  const token = "ethereum";

  if (!providerUrl) {
    throw new Error("INFURA_RPC is not set in the .env file");
  }

  const irys = new Irys({
    network,
    token,
    key: process.env.PRIVATE_KEY,
    config: { providerUrl },
  });
  return irys;
};

const uploadToIrys = async (
  data: any,
  tags: { name: string; value: string }[]
) => {
  const irys = await getIrys();
  const dataToUpload = JSON.stringify(data);
  try {
    const price = await irys.getPrice(Buffer.byteLength(dataToUpload));
    await irys.fund(price);

    const receipt = await irys.upload(dataToUpload, { tags });
    console.log(
      `Data uploaded successfully. https://gateway.irys.xyz/${receipt.id}`
    );
    return `https://gateway.irys.xyz/${receipt.id}`;
  } catch (e) {
    console.log("Error uploading data ", e);
    throw e;
  }
};
// --- End Irys Helper ---

const app = express();
app.use(express.json());
app.use(cors({ origin: "*" })); // Adjust as needed

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); // Assume available

const HISTORY_FILE = path.resolve(__dirname, "history.json"); // Local file for history inside saga folder

// Initialize history file if not exists
if (!fs.existsSync(HISTORY_FILE)) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify([]));
}

interface SyntheticRow {
  original_text: string;
  synthetic_output: {
    synthetic_transcription: string;
    medical_specialty: string;
    explanation: string;
  };
  verification_status: string;
  signature: string;
}

async function generate_synthetic_data(
  model: any,
  base_data: { text: string }[]
): Promise<SyntheticRow[]> {
  const synthetic_results: SyntheticRow[] = [];
  for (let i = 0; i < base_data.length; i++) {
    try {
      console.log(`Processing row ${i + 1}/${base_data.length}...`);
      const original_text = base_data[i].text;

      const prompt = `
        You are a helpful assistant for creating synthetic medical data.
        Based on the following medical transcription, please generate a new, paraphrased version.
        The new version should be medically coherent but different in wording.
        Also, provide a new 'medical_specialty' and a brief 'explanation' for the generated transcription.

        Original Transcription:
        "${original_text}"

        Please provide the output in a valid JSON format with the following keys:
        - "synthetic_transcription": The new, paraphrased transcription.
        - "medical_specialty": The relevant medical specialty.
        - "explanation": A brief explanation of the synthetic transcription.

        Example Output:
        {
            "synthetic_transcription": "The patient reports a history of chronic migraines and is currently prescribed sumatriptan.",
            "medical_specialty": "Neurology",
            "explanation": "This transcription documents a patient's history and treatment for a neurological condition."
        }
      `;

      const generationConfig = {
        responseMimeType: "application/json",
        maxOutputTokens: 3000,
        temperature: 0.7,
      };

      const response = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig,
      });

      if (!response.response.text()) {
        console.log(`  Skipping row ${i + 1} due to empty response.`);
        continue;
      }

      const synthetic_output = JSON.parse(response.response.text());

      const verified_signed_data = verify_and_sign_data({
        original_text,
        synthetic_output,
      });

      if (verified_signed_data) {
        synthetic_results.push(verified_signed_data);
        console.log(
          `  Successfully generated and verified synthetic data for row ${
            i + 1
          }.`
        );
      }
    } catch (error) {
      console.log(`  Error for row ${i + 1}: ${error}. Skipping.`);
    }
  }
  return synthetic_results;
}

function verify_and_sign_data(synthetic_row: {
  original_text: string;
  synthetic_output: any;
}): SyntheticRow | null {
  try {
    const output = synthetic_row.synthetic_output;
    if (
      !["synthetic_transcription", "medical_specialty", "explanation"].every(
        (key) => key in output && output[key]
      )
    ) {
      console.log("  Verification failed: Missing or empty fields.");
      return { ...synthetic_row, verification_status: "failed", signature: "" };
    }

    // Removed ECDSA logic as per request
    return { ...synthetic_row, verification_status: "verified", signature: "" };
  } catch (error) {
    console.log(`  Error during verification/signing: ${error}`);
    return null;
  }
}

// Main generate endpoint
app.post("/api/generate", async (req: Request, res: Response) => {
  const {
    input_text,
    sample_size = 3,
    model: requestModel = "gemini-2.0-flash",
    max_tokens = 3000,
    dataset_name = "Generated Dataset",
    description = "Synthetic dataset",
    visibility = "public-sellable",
    price = "5",
    tags = ["synthetic"],
  } = req.body;

  if (!input_text) {
    return res.status(400).json({ error: "input_text is required" });
  }

  try {
    // Create sample_size variations of the input text
    const input_data = Array(sample_size).fill({ text: input_text });

    console.log(`Generating ${sample_size} synthetic data samples...`);
    const synthetic = await generate_synthetic_data(model, input_data);

    if (synthetic.length === 0) {
      throw new Error("Generation failed, no results.");
    }

    // Upload to Irys
    console.log("Uploading generated data to Irys...");
    const contentUrl = await uploadToIrys(synthetic, [
      { name: "Content-Type", value: "application/json" },
      { name: "App-Name", value: "SagaSynth" },
      { name: "Type", value: "Dataset" },
    ]);

    const metadata = {
      name: dataset_name,
      description: description,
      content_url: contentUrl,
      sample_size: synthetic.length,
      model: requestModel,
      max_tokens: max_tokens,
      visibility: visibility,
      price_usdc: parseFloat(price),
      tags: tags,
      created_at: new Date().toISOString(),
      input_text: input_text,
    };

    console.log("Uploading metadata to Irys...");
    const metadataUrl = await uploadToIrys(metadata, [
      { name: "Content-Type", value: "application/json" },
      { name: "App-Name", value: "SagaSynth" },
      { name: "Type", value: "Metadata" },
    ]);

    // Save to history
    const history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
    history.push({
      input_text,
      data: synthetic,
      metadata: metadata,
      created_at: new Date().toISOString(),
      content_url: contentUrl,
      metadata_url: metadataUrl,
    });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history));

    res.json({
      success: true,
      message: "Dataset generated successfully",
      data: synthetic,
      metadata: metadata,
      irys_links: {
        content_url: contentUrl,
        metadata_url: metadataUrl,
      },
      ready_for_nft: {
        sourceUrl: input_text,
        contentLink: contentUrl,
        tokenURI: metadataUrl,
        tags: tags,
      },
    });
  } catch (error) {
    console.error("Generation error:", error);
    res.status(500).json({
      error: "Generation failed",
      details: (error as Error).message,
    });
  }
});

app.post("/api/generate/test", async (req: Request, res: Response) => {
  const { input_text, domain = "medical" } = req.body;

  try {
    // Create 3 variations of the input text
    const test_data = [
      { text: input_text },
      { text: input_text },
      { text: input_text },
    ];

    const synthetic = await generate_synthetic_data(model, test_data);
    if (synthetic.length === 0) {
      throw new Error("Generation failed, no results.");
    }

    // --- Irys Upload Logic ---
    console.log("Uploading generated data to Irys...");
    const contentUrl = await uploadToIrys(synthetic, [
      { name: "Content-Type", value: "application/json" },
      { name: "App-Name", value: "Saga-AI-Generator" },
    ]);

    const metadata = {
      name: `Synthetic Dataset for: ${input_text.substring(0, 30)}...`,
      description: `A synthetic dataset generated based on the input: "${input_text}"`,
      content_url: contentUrl,
      domain: domain,
      created_at: new Date().toISOString(),
    };

    console.log("Uploading metadata to Irys...");
    const metadataUrl = await uploadToIrys(metadata, [
      { name: "Content-Type", value: "application/json" },
      { name: "App-Name", value: "Saga-AI-Generator-Metadata" },
    ]);
    // --- End Irys Upload Logic ---

    // Save to local history (append)
    const history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
    history.push({
      input_text,
      domain,
      data: synthetic,
      created_at: new Date().toISOString(),
      content_url: contentUrl,
      metadata_url: metadataUrl,
    });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history));

    res.json({
      message: "Test generation and Irys upload successful",
      input_text,
      data: synthetic,
      irys_links: {
        content_url: contentUrl,
        metadata_url: metadataUrl,
      },
    });
  } catch (error) {
    res.status(500).json({ detail: (error as Error).message });
  }
});

app.get("/api/generate/history", (req: Request, res: Response) => {
  try {
    const history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));

    // Format each record (mock metadata since removed Mongo fields)
    const formatted_history = history.map((record: any) => ({
      metadata: {
        dataset_name: "Test Dataset", // Mock
        description: "Test generation", // Mock
        visibility: "Private", // Mock
        price_usdc: 0, // Mock
        domain: record.domain,
        sample_size: record.data.length,
        max_tokens: 3000, // Mock
        output_format: "JSON", // Mock
        source_dataset: "Custom Input", // Mock
        ai_model: "Gemini 2.5 Flash", // Mock
        created_at: record.created_at,
        filename: "test.csv", // Mock
      },
      data: record.data,
    }));

    formatted_history.sort(
      (a: any, b: any) =>
        new Date(b.metadata.created_at).getTime() -
        new Date(a.metadata.created_at).getTime()
    );

    res.json({
      total_records: formatted_history.length,
      history: formatted_history.slice(0, 100), // Limit to latest 100
    });
  } catch (error) {
    res
      .status(500)
      .json({ detail: `Error fetching history: ${(error as Error).message}` });
  }
});

// --- NFT & Blockchain API Endpoints ---

// Get contract instance helper
const getContract = async () => {
  const { ethers } = await import("ethers");
  const fs = await import("fs");
  const path = await import("path");

  const privateKey = process.env.PRIVATE_KEY || "";
  if (!privateKey) {
    throw new Error("PRIVATE_KEY not set in environment");
  }

  const provider = new ethers.JsonRpcProvider(
    "https://asga-2752562277992000-1.jsonrpc.sagarpc.io"
  );
  const wallet = new ethers.Wallet(privateKey, provider);

  const artifactsPath = path.join(
    __dirname,
    "./artifacts/contracts/Contract.sol/CrawlRegistry.json"
  );
  const contractArtifact = JSON.parse(fs.readFileSync(artifactsPath, "utf8"));

  const CONTRACT_ADDRESS = "0x6251C36F321aeEf6F06ED0fdFcd597862e784D06";
  const contract = new ethers.Contract(
    CONTRACT_ADDRESS,
    contractArtifact.abi,
    wallet
  );

  return { contract, wallet };
};

// 1. Upload dataset to Irys and prepare for NFT minting
app.post("/api/dataset/upload", async (req: Request, res: Response) => {
  try {
    const { data, metadata } = req.body;

    if (!data || !metadata) {
      return res.status(400).json({ error: "Data and metadata are required" });
    }

    // Upload data to Irys
    const dataTags = [
      { name: "Content-Type", value: "application/json" },
      { name: "App-Name", value: "SagaSynth" },
      { name: "Type", value: "Dataset" },
    ];

    const dataUrl = await uploadToIrys(data, dataTags);

    // Create content hash
    const crypto = await import("crypto");
    const contentHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(data))
      .digest("hex");

    // Upload metadata to Irys
    const metadataWithLinks = {
      ...metadata,
      dataUrl,
      contentHash,
      createdAt: new Date().toISOString(),
    };

    const metadataTags = [
      { name: "Content-Type", value: "application/json" },
      { name: "App-Name", value: "SagaSynth" },
      { name: "Type", value: "Metadata" },
    ];

    const metadataUrl = await uploadToIrys(metadataWithLinks, metadataTags);

    res.json({
      success: true,
      dataUrl,
      metadataUrl,
      contentHash: "0x" + contentHash,
      prepared: {
        sourceUrl: metadata.sourceUrl || "SagaSynth Generated",
        contentHash: "0x" + contentHash,
        contentLink: dataUrl,
        embedVectorId: "vector_" + Date.now(),
        createdAt: Math.floor(Date.now() / 1000),
        tags: metadata.tags || ["synthetic", "dataset"],
        tokenURI: metadataUrl,
      },
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      error: "Upload failed",
      details: (error as Error).message,
    });
  }
});

// 2. Mint NFT for dataset
app.post("/api/nft/mint", async (req: Request, res: Response) => {
  try {
    const {
      sourceUrl,
      contentHash,
      contentLink,
      embedVectorId,
      createdAt,
      tags,
      tokenURI,
    } = req.body;

    if (!contentHash || !contentLink || !tokenURI) {
      return res.status(400).json({
        error: "Missing required fields for minting",
      });
    }

    const { contract } = await getContract();

    const tx = await contract.mintMetadataNFT(
      sourceUrl || "SagaSynth Dataset",
      contentHash,
      contentLink,
      embedVectorId || "vector_" + Date.now(),
      createdAt || Math.floor(Date.now() / 1000),
      tags || ["synthetic"],
      tokenURI
    );

    const receipt = await tx.wait();

    // Get token ID from event
    const event = receipt.logs.find(
      (log: any) => log.fragment && log.fragment.name === "MetadataMinted"
    );

    const tokenId = event ? event.args[0].toString() : null;

    res.json({
      success: true,
      tokenId,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
    });
  } catch (error) {
    console.error("Minting error:", error);
    res.status(500).json({
      error: "Minting failed",
      details: (error as Error).message,
    });
  }
});

// 3. Get NFT metadata
app.get("/api/nft/:tokenId", async (req: Request, res: Response) => {
  try {
    const { tokenId } = req.params;
    const { contract } = await getContract();

    const metadata = await contract.getMetadata(tokenId);

    res.json({
      tokenId,
      sourceUrl: metadata.source_url,
      contentHash: metadata.content_hash,
      contentLink: metadata.content_link,
      embedVectorId: metadata.embed_vector_id,
      createdAt: Number(metadata.created_at),
      tags: metadata.tags,
      owner: metadata.owner,
    });
  } catch (error) {
    console.error("Get metadata error:", error);
    res.status(500).json({
      error: "Failed to get metadata",
      details: (error as Error).message,
    });
  }
});

// 4. Get all NFTs by creator
app.get("/api/nft/creator/:address", async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { contract } = await getContract();

    const tokenIds = await contract.getMetadataByCreator(address);

    // Get metadata for each token
    const nfts = await Promise.all(
      tokenIds.map(async (id: any) => {
        const metadata = await contract.getMetadata(id);
        return {
          tokenId: id.toString(),
          sourceUrl: metadata.source_url,
          contentHash: metadata.content_hash,
          contentLink: metadata.content_link,
          embedVectorId: metadata.embed_vector_id,
          createdAt: Number(metadata.created_at),
          tags: metadata.tags,
          owner: metadata.owner,
        };
      })
    );

    res.json({
      creator: address,
      totalNFTs: nfts.length,
      nfts,
    });
  } catch (error) {
    console.error("Get creator NFTs error:", error);
    res.status(500).json({
      error: "Failed to get creator NFTs",
      details: (error as Error).message,
    });
  }
});

// 5. Donate to creator
app.post("/api/nft/:tokenId/donate", async (req: Request, res: Response) => {
  try {
    const { tokenId } = req.params;
    const { amount } = req.body; // Amount in ETH as string

    if (!amount) {
      return res.status(400).json({ error: "Amount is required" });
    }

    const { contract } = await getContract();
    const { ethers } = await import("ethers");

    const tx = await contract.donateToCreator(tokenId, {
      value: ethers.parseEther(amount),
    });

    const receipt = await tx.wait();

    res.json({
      success: true,
      tokenId,
      amount,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
    });
  } catch (error) {
    console.error("Donation error:", error);
    res.status(500).json({
      error: "Donation failed",
      details: (error as Error).message,
    });
  }
});

// 6. Get all NFTs (marketplace view)
app.get("/api/marketplace/nfts", async (req: Request, res: Response) => {
  try {
    const { contract, wallet } = await getContract();

    // Get all NFTs created by the current wallet (you can expand this)
    const tokenIds = await contract.getMetadataByCreator(wallet.address);

    const nfts = await Promise.all(
      tokenIds.map(async (id: any) => {
        const metadata = await contract.getMetadata(id);

        // Fetch actual metadata from Irys if available
        let metadataContent = null;
        try {
          const tokenURI = await contract.tokenURI(id);
          if (tokenURI) {
            const response = await fetch(tokenURI);
            if (response.ok) {
              metadataContent = await response.json();
            }
          }
        } catch (e) {
          console.log("Could not fetch metadata content:", e);
        }

        return {
          tokenId: id.toString(),
          sourceUrl: metadata.source_url,
          contentHash: metadata.content_hash,
          contentLink: metadata.content_link,
          embedVectorId: metadata.embed_vector_id,
          createdAt: Number(metadata.created_at),
          tags: metadata.tags,
          owner: metadata.owner,
          metadata: metadataContent,
        };
      })
    );

    res.json({
      totalNFTs: nfts.length,
      nfts: nfts.sort((a, b) => b.createdAt - a.createdAt),
    });
  } catch (error) {
    console.error("Get marketplace NFTs error:", error);
    res.status(500).json({
      error: "Failed to get marketplace NFTs",
      details: (error as Error).message,
    });
  }
});

// 7. Get dataset preview from Irys
app.get("/api/dataset/preview", async (req: Request, res: Response) => {
  try {
    const { url } = req.query;

    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL parameter is required" });
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch from ${url}`);
    }

    const data = await response.json();

    // Return first 5 rows for preview
    const preview = Array.isArray(data) ? data.slice(0, 5) : data;

    res.json({
      preview,
      totalRows: Array.isArray(data) ? data.length : 1,
      previewRows: Array.isArray(preview) ? preview.length : 1,
    });
  } catch (error) {
    console.error("Preview error:", error);
    res.status(500).json({
      error: "Failed to get preview",
      details: (error as Error).message,
    });
  }
});

// Combined generate + mint endpoint
app.post("/api/generate-and-mint", async (req: Request, res: Response) => {
  try {
    const {
      input_text,
      sample_size = 3,
      dataset_name = "Generated Dataset",
      description = "Synthetic dataset",
      tags = ["synthetic"],
    } = req.body;

    if (!input_text) {
      return res.status(400).json({ error: "input_text is required" });
    }

    // Step 1: Generate data
    console.log(`Generating ${sample_size} synthetic data samples...`);
    const input_data = Array(sample_size).fill({ text: input_text });
    const synthetic = await generate_synthetic_data(model, input_data);

    if (synthetic.length === 0) {
      throw new Error("Generation failed, no results.");
    }

    // Step 2: Upload to Irys
    console.log("Uploading to Irys...");
    const contentUrl = await uploadToIrys(synthetic, [
      { name: "Content-Type", value: "application/json" },
      { name: "App-Name", value: "SagaSynth" },
      { name: "Type", value: "Dataset" },
    ]);

    // Create content hash
    const crypto = await import("crypto");
    const contentHash =
      "0x" +
      crypto
        .createHash("sha256")
        .update(JSON.stringify(synthetic))
        .digest("hex");

    const metadata = {
      name: dataset_name,
      description: description,
      content_url: contentUrl,
      sample_size: synthetic.length,
      tags: tags,
      created_at: new Date().toISOString(),
      input_text: input_text,
    };

    const metadataUrl = await uploadToIrys(metadata, [
      { name: "Content-Type", value: "application/json" },
      { name: "App-Name", value: "SagaSynth" },
      { name: "Type", value: "Metadata" },
    ]);

    // Step 3: Mint NFT automatically
    console.log("Minting NFT...");
    const { contract } = await getContract();

    const tx = await contract.mintMetadataNFT(
      input_text,
      contentHash,
      contentUrl,
      "vector_" + Date.now(),
      Math.floor(Date.now() / 1000),
      tags,
      metadataUrl
    );

    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (log: any) => log.fragment && log.fragment.name === "MetadataMinted"
    );
    const tokenId = event ? event.args[0].toString() : null;

    // Step 4: Save to history
    const history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
    history.push({
      input_text,
      data: synthetic,
      metadata: metadata,
      created_at: new Date().toISOString(),
      content_url: contentUrl,
      metadata_url: metadataUrl,
      tokenId: tokenId,
      transactionHash: tx.hash,
    });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history));

    res.json({
      success: true,
      message: "Dataset generated and NFT minted successfully",
      tokenId: tokenId,
      transactionHash: tx.hash,
      data: synthetic,
      metadata: metadata,
      irys_links: {
        content_url: contentUrl,
        metadata_url: metadataUrl,
      },
      donation_info: {
        tokenId: tokenId,
        donateEndpoint: `/api/nft/${tokenId}/donate`,
        example: {
          method: "POST",
          url: `http://localhost:3001/api/nft/${tokenId}/donate`,
          body: { amount: "0.01" },
        },
      },
    });
  } catch (error) {
    console.error("Generate and mint error:", error);
    res.status(500).json({
      error: "Generate and mint failed",
      details: (error as Error).message,
    });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
