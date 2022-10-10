var express = require('express');
var router = express.Router();

// Redirect to api.
router.get('/', (req: any, res: any, next: any) => {
	return res.redirect('/api');
});

module.exports = router;
