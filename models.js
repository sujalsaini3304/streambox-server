import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
            trim: true
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true
        },
        password: {
            type: String,
            required: true,
            select: false
        },
        user_image: {
            type: String,
            required: false,
            default: null
        },
        email_verified: {
            type: Boolean,
            required: true,
            default: false
        },
        role: {
            type: String,
            required: true,
            // default: "user"
            //   enum: ["user", "admin"],
            // select: false
        }
    },
    { timestamps: true }
);

const videoSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        userEmail: { type: String, required: true },
        public_id: { type: String, required: true },
        secure_url: { type: String, required: true },
        original_filename: String,
        format: String,
        duration: Number,
        bytes: Number,
        width: Number,
        height: Number,
        folder: String,
        thumbnail_url: String,
        title: String,
        isDeleted: { type: Boolean, default: false },
    },
    { timestamps: true }
);


const User = mongoose.models.User || mongoose.model("User", userSchema);
const Video = mongoose.models.Video || mongoose.model("Video", videoSchema);

export {
    User, Video
}
