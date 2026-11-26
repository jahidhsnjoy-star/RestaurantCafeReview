const express = require('express');
const {graphql} = require('graphql');
const authenticateToken = require('../middleware/authMiddleware');
const schema = require('../graphql/schema');

const router = express.Router();

router.post('/', authenticateToken.optional, async (req, res) => {
  const body = req.body;
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    typeof body.query !== 'string'
  ) {
    return res.status(400).json({
      errors: [{message: 'A GraphQL query string is required'}],
    });
  }

  if (
    body.variables !== undefined &&
    body.variables !== null &&
    (typeof body.variables !== 'object' || Array.isArray(body.variables))
  ) {
    return res.status(400).json({
      errors: [{message: 'GraphQL variables must be an object'}],
    });
  }

  if (
    body.operationName !== undefined &&
    body.operationName !== null &&
    typeof body.operationName !== 'string'
  ) {
    return res.status(400).json({
      errors: [{message: 'GraphQL operationName must be a string'}],
    });
  }

  try {
    const result = await graphql({
      schema,
      source: body.query,
      variableValues: body.variables,
      operationName: body.operationName,
      contextValue: {user: req.user ?? null},
    });
    return res.json(result);
  } catch {
    console.error('GraphQL request processing failed');
    return res.status(500).json({
      errors: [{message: 'GraphQL request failed'}],
    });
  }
});

module.exports = router;
