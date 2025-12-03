// db.js
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.POST_DB, process.env.POST_USERNAME,process.env.POST_PASSWORD , {
  host: process.env.POSTGRES_HOST,
  dialect: 'postgres',
  dialectModule: require('pg')
});

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Connected to PostgreSQL successfully!');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
})();

module.exports = sequelize;
