// migrations/202508041357_add_payment_id_and_foreign_key.js
exports.up = function (knex) {
  return knex.transaction(trx => {
    console.log('Starting migration transaction')

    // Step 1: Dynamically drop the foreign key constraints if they exist
    return trx
      .raw('SHOW CREATE TABLE payments')
      .then(result => {
        console.log('Step 1: SHOW CREATE TABLE payments result:', result[0][0]['Create Table'])
        const createTable = result[0][0]['Create Table']
        const fkMatches = [
          createTable.match(/FOREIGN KEY\s+\(`payment_button_id`\)\s+REFERENCES\s+`payment_buttons`\s+\(`(\w+)`\)/i),
          createTable.match(
            /FOREIGN KEY\s+\(`payment_button_id_temp`\)\s+REFERENCES\s+`payment_buttons`\s+\(`(\w+)`\)/i
          )
        ]
        const fkNames = fkMatches
          .map((fkMatch, index) => {
            if (fkMatch) {
              const constraintMatch = createTable.match(/CONSTRAINT\s+`(\w+)`\s+FOREIGN KEY/i, fkMatch.index)
              const name =
                constraintMatch?.[1] ||
                (index === 0 ? 'payments_payment_button_id_foreign' : 'payments_payment_button_id_temp_foreign')
              console.log(`Detected foreign key match ${index}: ${fkMatch[0]}, assigned name: ${name}`)
              return name
            }
            return null
          })
          .filter(name => name)
        console.log('Step 1: Foreign key names to drop:', fkNames)
        return Promise.all(
          fkNames.map(fkName =>
            trx
              .raw(`ALTER TABLE payments DROP FOREIGN KEY \`${fkName}\``)
              .then(() => console.log(`Successfully dropped foreign key ${fkName}`))
              .catch(err => {
                console.log(`Warning: Failed to drop foreign key ${fkName}: ${err.message}`)
                return null
              })
          )
        ).then(() => {
          return trx.schema
            .hasColumn('payments', 'payment_button_id')
            .then(exists => {
              console.log('Step 1: Checking payment_button_id column existence:', exists)
              if (exists)
                return trx.schema.table('payments', table => {
                  console.log('Dropping payment_button_id column')
                  table.dropColumn('payment_button_id')
                })
            })
            .then(() => {
              return trx.schema.hasColumn('payments', 'payment_button_id_temp').then(exists => {
                console.log('Step 1: Checking payment_button_id_temp column existence:', exists)
                if (exists)
                  return trx.schema.table('payments', table => {
                    console.log('Dropping payment_button_id_temp column')
                    table.dropColumn('payment_button_id_temp')
                  })
              })
            })
        })
      })
      .then(() => {
        console.log('Step 2: Starting payment_id column modification')
        // Step 2: Check and modify payment_id column to VARCHAR(24) if it exists
        return trx.schema.hasColumn('payment_buttons', 'payment_id').then(exists => {
          console.log('Step 2: payment_id column exists:', exists)
          if (exists) {
            return trx.schema
              .table('payment_buttons', table => {
                console.log('Dropping existing payment_id column')
                table.dropColumn('payment_id')
              })
              .then(() => {
                return trx.schema.table('payment_buttons', table => {
                  console.log('Adding new payment_id column as VARCHAR(24) unique nullable')
                  table.string('payment_id', 24).unique().nullable()
                })
              })
          } else {
            return trx.schema.table('payment_buttons', table => {
              console.log('Adding new payment_id column as VARCHAR(24) unique nullable')
              table.string('payment_id', 24).unique().nullable()
            })
          }
        })
      })
      .then(() => {
        console.log('Step 3: Starting payment_id population')
        // Step 3: Populate payment_id from description, continuing despite duplicates
        return trx('payment_buttons')
          .whereNotNull('description')
          .andWhere(knex.raw("description REGEXP 'Payment.*(paymentId|buttonId): [a-f0-9]+'"))
          .then(rows => {
            console.log('Step 3: Found', rows.length, 'rows to process for payment_id')
            const updates = []
            rows.forEach(row => {
              const matchPaymentId = row.description.match(/paymentId: ([a-f0-9]+)/i)
              const matchButtonId = row.description.match(/buttonId: ([a-f0-3]+)/i) // Adjusted regex to [a-f0-3] for consistency
              let paymentId = matchPaymentId ? matchPaymentId[1] : matchButtonId ? matchButtonId[1] : null
              if (paymentId && /^[a-f0-9]{16,24}$/.test(paymentId)) {
                console.log(`Attempting update for button_id ${row.button_id} with payment_id ${paymentId}`)
                updates.push(
                  trx('payment_buttons')
                    .where({ button_id: row.button_id })
                    .update({ payment_id: paymentId })
                    .catch(err => {
                      console.log(`Skipped update for ${row.button_id}: ${err.message}`)
                      return null
                    })
                )
              } else {
                console.log(
                  `Skipping update for ${row.button_id}: paymentId ${paymentId} invalid or not matching regex`
                )
              }
            })
            return Promise.all(updates)
          })
      })
      .then(() => {
        console.log('Step 4: Starting payment_button_id_temp restoration')
        // Step 4: Restore original payment_button_id temporarily
        return trx.schema.hasColumn('payments', 'payment_button_id_temp').then(exists => {
          console.log('Step 4: payment_button_id_temp exists:', exists)
          if (!exists) {
            return trx.schema
              .table('payments', table => {
                console.log('Adding payment_button_id_temp column')
                table
                  .string('payment_button_id_temp', 255)
                  .nullable()
                  .references('button_id')
                  .inTable('payment_buttons')
                  .onDelete('SET NULL')
                  .onUpdate('CASCADE')
              })
              .then(() => {
                return trx('payments')
                  .update({
                    payment_button_id_temp: trx.raw('NULL') // Clear first
                  })
                  .then(() => {
                    console.log('Clearing payment_button_id_temp to NULL')
                    return trx('payments')
                      .leftJoin('payment_buttons', 'payments.payment_id', 'payment_buttons.payment_id')
                      .update({
                        payment_button_id_temp: trx.ref('payment_buttons.button_id')
                      })
                      .then(() => console.log('Populated payment_button_id_temp with button_id where possible'))
                  })
              })
          } else {
            console.log('payment_button_id_temp already exists, skipping addition')
          }
        })
      })
      .then(() => {
        console.log('Step 5: Starting payment_button_id addition')
        // Step 5: Add the new payment_button_id with a deferred foreign key check
        return trx.schema.hasColumn('payments', 'payment_button_id').then(exists => {
          console.log('Step 5: payment_button_id exists:', exists)
          if (!exists) {
            return trx.schema
              .table('payments', table => {
                console.log('Adding payment_button_id column without initial foreign key')
                table.string('payment_button_id', 24).nullable()
              })
              .then(() => {
                console.log('Populating payment_button_id using payment_button_id_temp')
                // Populate payment_button_id using payment_button_id_temp
                return trx('payments')
                  .leftJoin('payment_buttons', 'payments.payment_button_id_temp', 'payment_buttons.button_id')
                  .update({
                    payment_button_id: trx.raw(
                      'CASE WHEN payment_buttons.payment_id IS NOT NULL THEN payment_buttons.payment_id ELSE (SELECT payment_id FROM payment_buttons WHERE payment_id IS NOT NULL LIMIT 1) END'
                    )
                  })
                  .then(() => console.log('Population of payment_button_id completed with default'))
              })
              .then(() => {
                console.log('Ensuring foreign key for payment_button_id_temp is dropped')
                // Ensure foreign key for payment_button_id_temp is dropped before dropping the column
                return trx.raw('SHOW CREATE TABLE payments').then(result => {
                  console.log('Step 5: SHOW CREATE TABLE payments result:', result[0][0]['Create Table'])
                  const createTable = result[0][0]['Create Table']
                  const tempFkMatch = createTable.match(
                    /FOREIGN KEY\s+\(`payment_button_id_temp`\)\s+REFERENCES\s+`payment_buttons`\s+\(`(\w+)`\)/i
                  )
                  if (tempFkMatch) {
                    const tempFkName =
                      createTable.match(
                        new RegExp(
                          `CONSTRAINT\\s+\\\`(\\w+)\\\`\\s+FOREIGN KEY\\s+\\(${tempFkMatch[0].match(/`(\w+)`/)[1]}\\)`,
                          'i'
                        )
                      )?.[1] || 'payments_payment_button_id_temp_foreign'
                    console.log(
                      `Detected temporary foreign key: ${tempFkName} for column ${tempFkMatch[0].match(/`(\w+)`/)[1]}`
                    )
                    return trx
                      .raw(`ALTER TABLE payments DROP FOREIGN KEY \`${tempFkName}\``)
                      .then(() => {
                        console.log(`Successfully dropped temporary foreign key ${tempFkName}`)
                        return trx.schema.table('payments', table => {
                          console.log('Dropping payment_button_id_temp column')
                          table.dropColumn('payment_button_id_temp')
                        })
                      })
                      .catch(err => {
                        console.log(`Warning: Failed to drop temporary foreign key ${tempFkName}: ${err.message}`)
                        return trx.schema.table('payments', table => {
                          console.log('Forcing drop of payment_button_id_temp due to constraint failure')
                          table.dropColumn('payment_button_id_temp')
                        })
                      })
                  } else {
                    console.log('No temporary foreign key found for payment_button_id_temp')
                    return trx.schema.table('payments', table => {
                      console.log('Dropping payment_button_id_temp column')
                      table.dropColumn('payment_button_id_temp')
                    })
                  }
                })
              })
              .then(() => {
                console.log('Adding foreign key for payment_button_id with NOT NULL enforcement')
                return trx.schema.table('payments', table => {
                  table
                    .foreign('payment_button_id')
                    .references('payment_id')
                    .inTable('payment_buttons')
                    .onDelete('RESTRICT')
                    .onUpdate('CASCADE')
                  table.string('payment_button_id', 24).notNullable().alter()
                })
              })
          }
        })
      })
      .then(trx.commit)
      .then(() => console.log('Migration transaction committed successfully'))
      .catch(trx.rollback)
      .then(() => console.log('Migration transaction rolled back or completed'))
  })
}

exports.down = function (knex) {
  return knex.transaction(trx => {
    console.log('Starting rollback transaction')
    return trx.schema
      .hasColumn('payments', 'payment_button_id')
      .then(exists => {
        if (exists) {
          console.log('Dropping foreign key and payment_button_id column')
          return trx.schema.table('payments', table => {
            table.dropForeign('payment_button_id')
            table.dropColumn('payment_button_id')
          })
        }
      })
      .then(() => {
        return trx.schema.hasColumn('payments', 'payment_button_id').then(exists => {
          console.log('Checking payment_button_id existence after drop:', exists)
          if (!exists) {
            console.log('Adding back payment_button_id column')
            return trx.schema.table('payments', table => {
              table
                .string('payment_button_id', 255)
                .nullable()
                .references('button_id')
                .inTable('payment_buttons')
                .onDelete('SET NULL')
                .onUpdate('CASCADE')
            })
          }
        })
      })
      .then(() => {
        return trx.schema.hasColumn('payment_buttons', 'payment_id').then(exists => {
          console.log('Checking payment_id existence:', exists)
          if (exists) {
            console.log('Dropping payment_id column')
            return trx.schema.table('payment_buttons', table => {
              table.dropColumn('payment_id')
            })
          }
        })
      })
      .then(trx.commit)
      .then(() => console.log('Rollback transaction committed successfully'))
      .catch(trx.rollback)
      .then(() => console.log('Rollback transaction rolled back or completed'))
  })
}
