import express from "express"
import { User, Video } from "./models.js";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken"
import { verifyToken } from "./authMiddleware.js";
import { connectDB } from "./db.js";
import cloudinary from "./cloudinary.js";

dotenv.config({
  path: ".env",
})

const route = express.Router();


route.get("/", (req, res) => {
  res.json({
    "message": "Server started",
    "status": 200
  })
})


// route.get("/videos/my", verifyToken, async (req, res) => {
//   try {
//     await connectDB();

//     const videos = await Video.find({
//       userId: req.user.id,
//       isDeleted: false,
//     }).sort({ createdAt: -1 });

//     res.status(200).json({
//       count: videos.length,
//       videos,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

route.get("/videos/my", verifyToken, async (req, res) => {
  try {
    await connectDB();

    // Fetch user's videos
    const videos = await Video.find({
      userId: req.user.id,
      isDeleted: false,
    }).sort({ createdAt: -1 });

    // Calculate storage used in bytes
    const usedBytes = videos.reduce((acc, video) => acc + (video.bytes || 0), 0);

    res.status(200).json({
      count: videos.length,
      videos,
      storage: {
        used: usedBytes,        // in bytes
        total: 500 * 1024 * 1024, // total storage in bytes (500 MB)
        videoCount: videos.length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


route.post("/video/save", verifyToken, async (req, res) => {
  try {
    await connectDB();

    const {
      public_id,
      secure_url,
      original_filename,
      format,
      duration,
      bytes,
      width,
      height,
      folder,
      thumbnail_url = "",
      title,
    } = req.body;

    if (!public_id || !secure_url) {
      return res.status(400).json({ message: "Missing video data" });
    }

    const video = await Video.create({
      userId: req.user.id,
      userEmail: req.user.email,

      public_id,
      secure_url,
      original_filename,
      format,
      duration,
      bytes,
      width,
      height,
      folder,
      thumbnail_url,
      title,
    });

    res.status(201).json({
      message: "Video saved successfully",
      video,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


route.delete("/video/delete/:id", verifyToken, async (req, res) => {
  try {
    const videoId = req.params.id;
    const userEmail = req.user.email;

    // Find video & verify ownership
    const video = await Video.findOne({
      _id: videoId,
      userEmail,
    });

    if (!video) {
      return res.status(404).json({
        message: "Video not found or unauthorized",
      });
    }

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(video.public_id, {
      resource_type: "video",
    });

    // Delete metadata from MongoDB
    await Video.deleteOne({ _id: videoId });

    res.json({
      success: true,
      message: "Video deleted successfully",
    });
  } catch (err) {
    console.error("Delete video error:", err);

    res.status(500).json({
      success: false,
      error: "Failed to delete video",
    });
  }
});

// use for <= 35 mb upload limit only
// route.post("/cloudinary/signature", verifyToken, (req, res) => {
//   try {
//     const timestamp = Math.round(Date.now() / 1000);

//     const folder = `mp4vault/videos/${req.user.email}`;

//     // TRANSFORM ON UPLOAD (replaces original)
//     const transformation =
//       "f_mp4,q_auto:eco,vc_h264,ac_aac,br_1200k,w_1280,h_720,c_limit";

//     const signature = cloudinary.utils.api_sign_request(
//       {
//         timestamp,
//         folder,
//         transformation,
//       },
//       process.env.CLOUDINARY_API_SECRET
//     );

//     res.json({
//       timestamp,
//       signature,
//       cloudName: process.env.CLOUDINARY_CLOUD_NAME,
//       apiKey: process.env.CLOUDINARY_API_KEY,
//       folder,
//       transformation,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });


route.post("/cloudinary/signature", verifyToken, (req, res) => {
  try {
    const { useTransformation } = req.body;

    const timestamp = Math.round(Date.now() / 1000);
    const folder = `StreamBox/videos/${req.user.email}`;

    const params = {
      timestamp,
      folder,
    };

    // ONLY sign transformation when required
    if (useTransformation) {
      params.transformation =
        "f_mp4,q_auto:eco,vc_h264,ac_aac,br_1200k,w_1280,h_720,c_limit";
    }

    const signature = cloudinary.utils.api_sign_request(
      params,
      process.env.CLOUDINARY_API_SECRET
    );

    res.json({
      timestamp,
      signature,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      folder,
      transformation: useTransformation ? params.transformation : undefined,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



route.post("/create/user", async (req, res) => {
  try {
    await connectDB();
    const { name, email, password, role = "user" } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      username: name,
      email_verified: false,
      email,
      password: hashedPassword,
      role
    });

    res.status(201).json({
      message: "User created successfully",
      user: {
        id: user._id,
        name: user.username,
        email: user.email,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



route.post("/login/user", async (req, res) => {
  try {
    await connectDB();
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    // Find user + explicitly include password
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );


    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        user_image: user.user_image,
        role: user.role,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


route.delete("/delete/user", verifyToken, async (req, res) => {
  try {
    await connectDB();
    const userId = req.user.id;
    const userEmail = req.user.email;

    // Find all videos belonging to the user
    const videos = await Video.find({ userEmail });

    // Delete all videos from Cloudinary
    if (videos.length > 0) {
      for (const video of videos) {
        try {
          await cloudinary.uploader.destroy(video.public_id, {
            resource_type: "video",
          });
        } catch (cloudinaryErr) {
          console.error(`Failed to delete Cloudinary asset ${video.public_id}:`, cloudinaryErr);
        }
      }
    }

    // Delete all videos from MongoDB
    await Video.deleteMany({ userEmail });

    // Delete user from MongoDB
    const user = await User.findByIdAndDelete(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "User account and all associated data deleted successfully",
      deletedVideosCount: videos.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


export default route;

