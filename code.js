const TelegramBot = require("node-telegram-bot-api");
const mongoose = require("mongoose");
require("dotenv").config();

// Replace the token with your bot's API token
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL);

// Define a user schema and model
const userSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  firstName: { type: String, required: true },
  lastName: { type: String },
  contact: { type: String, required: true },
  password: { type: String, required: true },
});

const User = mongoose.model("User", userSchema);

// Store user state
const userStates = {};

// Event listener for /start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name;
  const lastName = msg.from.last_name ? ` ${msg.from.last_name}` : "";

  try {
    const existingUser = await User.findOne({ userId: msg.from.id });

    if (existingUser) {
      bot.sendMessage(
        chatId,
        `Hey ${firstName}${lastName}, you are already signed up!\nContact: ${existingUser.contact}\nPassword: ${existingUser.password}`
      );
    } else {
      bot.sendMessage(
        chatId,
        `Hey ${firstName}${lastName}\nTo signup in subsurf.in, please share your contact.`,
        {
          reply_markup: {
            keyboard: [
              [
                {
                  text: "Share Contact",
                  request_contact: true,
                },
              ],
            ],
            one_time_keyboard: true,
          },
        }
      );
    }
  } catch (err) {
    bot.sendMessage(chatId, "An error occurred. Please try again later.");
  }
});

// Event listener for contact message
bot.on("contact", (msg) => {
  const chatId = msg.chat.id;
  const contact = msg.contact;

  if (contact.user_id === msg.from.id) {
    userStates[chatId] = {
      stage: "contact_shared",
      contact: contact.phone_number,
    };
    bot.sendMessage(chatId, "Now, please enter a 4-digit PIN.", {
      reply_markup: {
        remove_keyboard: true,
      },
    });
  }
});

// Event listener for text messages
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;

  if (userStates[chatId] && userStates[chatId].stage === "contact_shared") {
    const pin = msg.text;

    if (/^\d{4}$/.test(pin)) {
      try {
        const newUser = new User({
          userId: msg.from.id,
          firstName: msg.from.first_name,
          lastName: msg.from.last_name || "",
          contact: userStates[chatId].contact,
          password: pin,
        });

        await newUser.save();

        bot.sendMessage(
          chatId,
          "Successfully completed signup. Now you can log in to subsurf.in with your number and 4-digit PIN."
        );
        delete userStates[chatId]; // Clear user state after successful signup
      } catch (err) {
        bot.sendMessage(chatId, "Error saving your data. Please try again.");
      }
    } else {
      bot
        .sendMessage(
          chatId,
          "Invalid PIN. You should only set a 4-digit number."
        )
        .then((sentMsg) => {
          setTimeout(() => {
            bot.deleteMessage(chatId, msg.message_id);
            bot.deleteMessage(chatId, sentMsg.message_id);
          }, 30000);
        });
    }
  }
});
