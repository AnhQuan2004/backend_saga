import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import * as dotenv from "dotenv";

dotenv.config();

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "";

async function main() {
  const privateKey = process.env.PRIVATE_KEY || "";
  if (!privateKey) {
    console.error("Please set your PRIVATE_KEY in the .env file");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(
    "https://asga-2752562277992000-1.jsonrpc.sagarpc.io"
  );
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log(`Connected with address: ${wallet.address}`);

  const artifactsPath = path.join(
    __dirname,
    "../artifacts/contracts/Contract.sol/CrawlRegistry.json"
  );
  const contractArtifact = JSON.parse(fs.readFileSync(artifactsPath, "utf8"));

  const contract = new ethers.Contract(
    CONTRACT_ADDRESS,
    contractArtifact.abi,
    wallet
  );

  // Create bounty for medical dataset research
  async function createMedicalBounty() {
    console.log("Creating bounty for Medical Dataset research...");

    const bountyAmount = "0.01"; // 0.01 ETH bounty

    try {
      const tx = await contract.createBounty({
        value: ethers.parseEther(bountyAmount),
      });

      const receipt = await tx.wait();
      console.log("Medical research bounty created successfully!");
      console.log(`Transaction hash: ${tx.hash}`);

      const event = receipt.logs.find(
        (log: any) => log.fragment && log.fragment.name === "BountyCreated"
      );

      if (event) {
        const bountyId = event.args[0];
        console.log(`Bounty ID: ${bountyId}`);
        console.log(`Bounty Amount: ${bountyAmount} ETH`);
        console.log("\nBounty Details:");
        console.log("- Purpose: Medical Data Analysis Research");
        console.log("- Dataset: Synthetic Medical Data (Token ID: 4)");
        console.log(
          "- Data Link: https://gateway.irys.xyz/79BNspugvS1UxPtYW5tyYk3FHcLwzPWsdzyMZgK3QmRY"
        );
        console.log(
          "- Metadata: https://gateway.irys.xyz/32e3FmKguGwpJLoad4bF2nRvxVND9HFDx91a2ZFFz472"
        );

        return bountyId;
      }
    } catch (error) {
      console.error("Error creating medical bounty:", error);
    }
  }

  // Get current bounty info
  async function getAllBounties() {
    console.log("\n=== All Available Bounties ===");
    try {
      // This would need to be implemented in the contract to get all bounties
      // For now, we'll just show the bounty we know exists
      console.log("Bounty ID 1, 2, 3 (from previous runs)");
      console.log("Bounty ID 4+ (newly created medical bounties)");
    } catch (error) {
      console.error("Error getting bounties:", error);
    }
  }

  try {
    console.log("=== Creating Medical Research Bounty ===");
    const bountyId = await createMedicalBounty();

    if (bountyId) {
      await getAllBounties();

      console.log("\n✅ Next Steps:");
      console.log("1. Researchers can now contribute to this bounty");
      console.log("2. Add contributors using addContributor function");
      console.log("3. Distribute bounty when research is completed");
      console.log("4. Share the dataset link with researchers");
    }
  } catch (error) {
    console.error("Error in execution:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
