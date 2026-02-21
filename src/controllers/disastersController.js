const pool = require('../db/pool');

const getAllDisasters = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const result = await pool.query(
            `SELECT d.*, dt.type_name, ds.subgroup_name 
             FROM disasterevent d
             LEFT JOIN disastertype dt ON d.disaster_type_id = dt.type_id
             LEFT JOIN disastersubgroup ds ON dt.subgroup_id = ds.subgroup_id
             ORDER BY start_timestamp DESC LIMIT $1`,
            [limit]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getAllDisasters
};
