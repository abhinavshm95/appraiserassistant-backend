const { Sequelize, DataTypes } = require('sequelize');
const { securePassword } = require("./universalFunction/universalFunction");
require("dotenv").config();

const sequelize = new Sequelize(process.env.POST_DB, process.env.POST_USERNAME, process.env.POST_PASSWORD, {
  host: process.env.POSTGRES_HOST,
  dialect: 'postgres',
});

// Define User model
const User = sequelize.define('User', {
  name: {
    type: DataTypes.STRING,
  },
  email: {
    type: DataTypes.STRING,
  },
  password: {
    type: DataTypes.STRING,
  },
  phone: {
    type: DataTypes.BIGINT,
  },
  otp: {
    type: DataTypes.STRING,
  },
  accessToken: {
    type: DataTypes.STRING,
  },
  isEmailVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  isPhoneVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  role: {
    type: DataTypes.STRING,
    defaultValue: 'standard',
  },
}, {
  tableName: 'Users',
  timestamps: true,
});

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Connected to PostgreSQL successfully!');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ where: { email: 'admin@appraiserassistant.com' } });

    if (existingAdmin) {
      console.log('Existing admin user found. Deleting to recreate with proper password...');
      await existingAdmin.destroy();
    }

    // Create new admin user
    const hashedPassword = await securePassword("admin@123");
    const admin = await User.create({
      name: 'admin',
      email: 'admin@appraiserassistant.com',
      password: hashedPassword,
      isEmailVerified: false,
      isPhoneVerified: false,
      role: 'admin',
    });

    console.log('Admin user created successfully in PostgreSQL');
    console.log('Email: admin@appraiserassistant.com');
    console.log('Password: admin@123');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
})();
