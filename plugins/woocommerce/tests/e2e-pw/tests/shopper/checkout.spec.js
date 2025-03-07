const { test, expect } = require( '@playwright/test' );
const wcApi = require( '@woocommerce/woocommerce-rest-api' ).default;
const { admin, customer } = require( '../../test-data/data' );

const guestEmail = 'checkout-guest@example.com';

test.describe( 'Checkout page', () => {
	const singleProductPrice = '9.99';
	const simpleProductName = 'Checkout Page Product';
	const twoProductPrice = ( singleProductPrice * 2 ).toString();
	const threeProductPrice = ( singleProductPrice * 3 ).toString();

	let guestOrderId, customerOrderId, productId, shippingZoneId;

	test.beforeAll( async ( { baseURL } ) => {
		const api = new wcApi( {
			url: baseURL,
			consumerKey: process.env.CONSUMER_KEY,
			consumerSecret: process.env.CONSUMER_SECRET,
			version: 'wc/v3',
		} );
		// ensure store address is US
		await api.post( 'settings/general/batch', {
			update: [
				{
					id: 'woocommerce_store_address',
					value: 'addr 1',
				},
				{
					id: 'woocommerce_store_city',
					value: 'San Francisco',
				},
				{
					id: 'woocommerce_default_country',
					value: 'US:CA',
				},
				{
					id: 'woocommerce_store_postcode',
					value: '94107',
				},
			],
		} );
		// add product
		await api
			.post( 'products', {
				name: simpleProductName,
				type: 'simple',
				regular_price: singleProductPrice,
			} )
			.then( ( response ) => {
				productId = response.data.id;
			} );
		// add a shipping zone and method
		await api
			.post( 'shipping/zones', {
				name: 'Free Shipping Oregon',
			} )
			.then( ( response ) => {
				shippingZoneId = response.data.id;
			} );
		await api.put( `shipping/zones/${ shippingZoneId }/locations`, [
			{
				code: 'US:OR',
				type: 'state',
			},
		] );
		await api.post( `shipping/zones/${ shippingZoneId }/methods`, {
			method_id: 'free_shipping',
		} );
		// enable bank transfers and COD for payment
		await api.put( 'payment_gateways/bacs', {
			enabled: true,
		} );
		await api.put( 'payment_gateways/cod', {
			enabled: true,
		} );
	} );

	test.afterAll( async ( { baseURL } ) => {
		const api = new wcApi( {
			url: baseURL,
			consumerKey: process.env.CONSUMER_KEY,
			consumerSecret: process.env.CONSUMER_SECRET,
			version: 'wc/v3',
		} );
		await api.delete( `products/${ productId }`, {
			force: true,
		} );
		await api.delete( `shipping/zones/${ shippingZoneId }`, {
			force: true,
		} );
		await api.put( 'payment_gateways/bacs', {
			enabled: false,
		} );
		await api.put( 'payment_gateways/cod', {
			enabled: false,
		} );
		// delete the orders we created
		if ( guestOrderId ) {
			await api.delete( `orders/${ guestOrderId }`, { force: true } );
		}
		if ( customerOrderId ) {
			await api.delete( `orders/${ customerOrderId }`, { force: true } );
		}
	} );

	test.beforeEach( async ( { context } ) => {
		// Shopping cart is very sensitive to cookies, so be explicit
		await context.clearCookies();
	} );

	test( 'should display cart items in order review', async ( { page } ) => {
		await page.goto( `/shop/?add-to-cart=${ productId }` );
		await page.waitForLoadState( 'networkidle' );

		await page.goto( '/checkout/' );

		await expect( page.locator( 'td.product-name' ) ).toContainText(
			simpleProductName
		);
		await expect( page.locator( 'strong.product-quantity' ) ).toContainText(
			'1'
		);
		await expect( page.locator( 'td.product-total' ) ).toContainText(
			singleProductPrice
		);
	} );

	test( 'allows customer to choose available payment methods', async ( {
		page,
	} ) => {
		// this time we're going to add two products to the cart
		for ( let i = 1; i < 3; i++ ) {
			await page.goto( `/shop/?add-to-cart=${ productId }` );
			await page.waitForLoadState( 'networkidle' );
		}

		await page.goto( '/checkout/' );
		await expect( page.locator( 'strong.product-quantity' ) ).toContainText(
			'2'
		);
		await expect( page.locator( 'td.product-total' ) ).toContainText(
			twoProductPrice
		);

		// check the payment methods
		await expect( page.locator( '#payment_method_bacs' ) ).toBeEnabled();
		await expect( page.locator( '#payment_method_cod' ) ).toBeEnabled();
	} );

	test( 'allows customer to fill billing details', async ( { page } ) => {
		// this time we're going to add three products to the cart
		for ( let i = 1; i < 4; i++ ) {
			await page.goto( `/shop/?add-to-cart=${ productId }` );
			await page.waitForLoadState( 'networkidle' );
		}

		await page.goto( '/checkout/' );
		await expect( page.locator( 'strong.product-quantity' ) ).toContainText(
			'3'
		);
		await expect( page.locator( 'td.product-total' ) ).toContainText(
			threeProductPrice
		);

		// asserting that you can fill in the billing details
		await expect( page.locator( '#billing_first_name' ) ).toBeEditable();
		await expect( page.locator( '#billing_last_name' ) ).toBeEditable();
		await expect( page.locator( '#billing_company' ) ).toBeEditable();
		await expect( page.locator( '#billing_country' ) ).toBeEnabled();
		await expect( page.locator( '#billing_address_1' ) ).toBeEditable();
		await expect( page.locator( '#billing_address_2' ) ).toBeEditable();
		await expect( page.locator( '#billing_city' ) ).toBeEditable();
		await expect( page.locator( '#billing_state' ) ).toBeEnabled();
		await expect( page.locator( '#billing_postcode' ) ).toBeEditable();
		await expect( page.locator( '#billing_phone' ) ).toBeEditable();
		await expect( page.locator( '#billing_email' ) ).toBeEditable();
	} );

	test( 'allows customer to fill shipping details', async ( { page } ) => {
		for ( let i = 1; i < 3; i++ ) {
			await page.goto( `/shop/?add-to-cart=${ productId }` );
			await page.waitForLoadState( 'networkidle' );
		}

		await page.goto( '/checkout/' );
		await expect( page.locator( 'strong.product-quantity' ) ).toContainText(
			'2'
		);
		await expect( page.locator( 'td.product-total' ) ).toContainText(
			twoProductPrice
		);

		await page.locator( '#ship-to-different-address' ).click();

		// asserting that you can fill in the shipping details
		await expect( page.locator( '#shipping_first_name' ) ).toBeEditable();
		await expect( page.locator( '#shipping_last_name' ) ).toBeEditable();
		await expect( page.locator( '#shipping_company' ) ).toBeEditable();
		await expect( page.locator( '#shipping_country' ) ).toBeEnabled();
		await expect( page.locator( '#shipping_address_1' ) ).toBeEditable();
		await expect( page.locator( '#shipping_address_2' ) ).toBeEditable();
		await expect( page.locator( '#shipping_city' ) ).toBeEditable();
		await expect( page.locator( '#shipping_state' ) ).toBeEnabled();
		await expect( page.locator( '#shipping_postcode' ) ).toBeEditable();
	} );

	test( 'allows guest customer to place an order', async ( { page } ) => {
		for ( let i = 1; i < 3; i++ ) {
			await page.goto( `/shop/?add-to-cart=${ productId }` );
			await page.waitForLoadState( 'networkidle' );
		}

		await page.goto( '/checkout/' );
		await expect( page.locator( 'strong.product-quantity' ) ).toContainText(
			'2'
		);
		await expect( page.locator( 'td.product-total' ) ).toContainText(
			twoProductPrice
		);

		await page.locator( '#billing_first_name' ).fill( 'Lisa' );
		await page.locator( '#billing_last_name' ).fill( 'Simpson' );
		await page
			.locator( '#billing_address_1' )
			.fill( '123 Evergreen Terrace' );
		await page.locator( '#billing_city' ).fill( 'Springfield' );
		await page.locator( '#billing_state' ).selectOption( 'OR' );
		await page.locator( '#billing_postcode' ).fill( '97403' );
		await page.locator( '#billing_phone' ).fill( '555 555-5555' );
		await page.locator( '#billing_email' ).fill( guestEmail );

		await page.locator( 'text=Cash on delivery' ).click();
		await expect( page.locator( 'div.payment_method_cod' ) ).toBeVisible();

		await page.locator( 'text=Place order' ).click();

		await expect( page.locator( 'h1.entry-title' ) ).toContainText(
			'Order received'
		);

		// get order ID from the page
		const orderReceivedText = await page
			.locator( '.woocommerce-order-overview__order.order' )
			.textContent();
		guestOrderId = await orderReceivedText.split( /(\s+)/ )[ 6 ].toString();

		// If we simulate a new browser context by dropping all cookies, and reload the page, the shopper should be
		// prompted to complete an email validation step before they can proceed.
		await page.context().clearCookies();
		await page.reload();
		await expect( page.locator( 'form.woocommerce-verify-email p:nth-child(3)' ) ).toContainText(
			/verify the email address associated with the order/
		);

		// Supplying an email address other than the actual order billing email address will take them back to the same
		// page with an error message.
		await page.fill( '#email', 'incorrect@email.address' );
		await page.locator( 'form.woocommerce-verify-email button' ).click();
		await expect( page.locator( 'form.woocommerce-verify-email p:nth-child(4)' ) ).toContainText(
			/verify the email address associated with the order/
		);
		await expect( page.locator( 'ul.woocommerce-error li' ) ).toContainText(
			/We were unable to verify the email address you provided/
		);

		// However if they supply the *correct* billing email address, they should see the order received page again.
		await page.fill( '#email', guestEmail );
		await page.locator( 'form.woocommerce-verify-email button' ).click();
		await expect( page.locator( 'h1.entry-title' ) ).toContainText(
			'Order received'
		);

		await page.goto( 'wp-login.php' );
		await page.locator( 'input[name="log"]' ).fill( admin.username );
		await page.locator( 'input[name="pwd"]' ).fill( admin.password );
		await page.locator( 'text=Log In' ).click();

		// load the order placed as a guest
		await page.goto(
			`wp-admin/post.php?post=${ guestOrderId }&action=edit`
		);

		await expect(
			page.locator( 'h2.woocommerce-order-data__heading' )
		).toContainText( `Order #${ guestOrderId } details` );
		await expect( page.locator( '.wc-order-item-name' ) ).toContainText(
			simpleProductName
		);
		await expect( page.locator( 'td.quantity >> nth=0' ) ).toContainText(
			'2'
		);
		await expect( page.locator( 'td.item_cost >> nth=0' ) ).toContainText(
			singleProductPrice
		);
		await expect( page.locator( 'td.line_cost >> nth=0' ) ).toContainText(
			twoProductPrice
		);
	} );

	test( 'allows existing customer to place order', async ( { page } ) => {
		await page.goto( 'my-account/' );
		await page.locator( 'input[name="username"]' ).fill( customer.username );
		await page.locator( 'input[name="password"]' ).fill( customer.password );
		await page.locator( 'text=Log In' ).click();
		await page.waitForLoadState( 'networkidle' );
		for ( let i = 1; i < 3; i++ ) {
			await page.goto( `/shop/?add-to-cart=${ productId }` );
			await page.waitForLoadState( 'networkidle' );
		}

		await page.goto( '/checkout/' );
		await expect( page.locator( 'strong.product-quantity' ) ).toContainText(
			'2'
		);
		await expect( page.locator( 'td.product-total' ) ).toContainText(
			twoProductPrice
		);

		await page.locator( '#billing_first_name' ).fill( 'Homer' );
		await page.locator( '#billing_last_name' ).fill( 'Simpson' );
		await page
			.locator( '#billing_address_1' )
			.fill( '123 Evergreen Terrace' );
		await page.locator( '#billing_city' ).fill( 'Springfield' );
		await page.locator( '#billing_country' ).selectOption( 'US' );
		await page.locator( '#billing_state' ).selectOption( 'OR' );
		await page.locator( '#billing_postcode' ).fill( '97403' );
		await page.locator( '#billing_phone' ).fill( '555 555-5555' );
		await page.locator( '#billing_email' ).fill( customer.email );

		await page.locator( 'text=Cash on delivery' ).click();
		await expect( page.locator( 'div.payment_method_cod' ) ).toBeVisible();

		await page.locator( 'text=Place order' ).click();

		await expect( page.locator( 'h1.entry-title' ) ).toContainText(
			'Order received'
		);

		// get order ID from the page
		const orderReceivedText = await page
			.locator( '.woocommerce-order-overview__order.order' )
			.textContent();
		customerOrderId = await orderReceivedText
			.split( /(\s+)/ )[ 6 ]
			.toString();

		// Effect a log out/simulate a new browsing session by dropping all cookies.
		await page.context().clearCookies();
		await page.reload();

		// Now we are logged out, return to the confirmation page: we should be asked to log back in.
		await expect( page.locator( '.woocommerce-info' ) ).toContainText(
			/Please log in to your account to view this order/
		);

		// Switch to admin user.
		await page.goto( 'wp-login.php?loggedout=true' );
		await page.locator( 'input[name="log"]' ).fill( admin.username );
		await page.locator( 'input[name="pwd"]' ).fill( admin.password );
		await page.locator( 'text=Log In' ).click();

		// load the order placed as a customer
		await page.goto(
			`wp-admin/post.php?post=${ customerOrderId }&action=edit`
		);
		await expect(
			page.locator( 'h2.woocommerce-order-data__heading' )
		).toContainText( `Order #${ customerOrderId } details` );
		await expect( page.locator( '.wc-order-item-name' ) ).toContainText(
			simpleProductName
		);
		await expect( page.locator( 'td.quantity >> nth=0' ) ).toContainText(
			'2'
		);
		await expect( page.locator( 'td.item_cost >> nth=0' ) ).toContainText(
			singleProductPrice
		);
		await expect( page.locator( 'td.line_cost >> nth=0' ) ).toContainText(
			twoProductPrice
		);
	} );
} );
