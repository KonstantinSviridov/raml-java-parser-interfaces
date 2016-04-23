package __fragment_package__;

import java.util.List;

public interface Fragment {
	
	/***
	 * AST node representing the fragment
	 **/
	BasicFragmentNode node();
	
	/***
	 * Importing external libraries that can be used within the API.
	 **/
	List<UsesEntry> uses();
}
